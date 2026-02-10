import { FunctionCallingConfigMode, FunctionDeclaration, GoogleGenAI } from "@google/genai";
import Ajv from "ajv";
import dayjs from "dayjs";
import { DocumentReference, getFirestore } from "firebase-admin/firestore";
import { prompts } from "./prompt";
import path from "path";
import lockfile from 'proper-lockfile'

const ajv = new Ajv()

export namespace Database {
    
    const db = getFirestore()

    export async function clearPendingGroup(groupId?: string) {
        if(groupId) {
            await db.collection('group').doc(groupId).delete()
            return
        }
        const snapshots = await db.collection('group').where('expiredAt', '==', null).get()
        for(const {ref} of snapshots.docs) {
            await ref.delete()
        }
    }

    export async function getLastestGroup(insertData: PartialGroupData) {
        const {year, type, city, district} = insertData
        const groups = await db
            .collection('group')
            .where('year', '==', year)
            .where('type', '==', type)
            .where('city', '==', city)
            .where('district', '==', district)
            .where('expiredAt', '!=', null)
            .orderBy('expiredAt', 'desc')
            .limit(1)
            .get()

        const groupRef = groups.docs.at(0)?.ref
        if(!groupRef) return null

        const groupData = (await groupRef.get()).data()
        if(!groupData) throw new Error()

        return {id: groupRef.id, ...groupData} as Selectable<GroupData & {expiredAt: number}>
    }

    export async function createGroup(insertData: PartialGroupData) {
        const {year, type, city, district} = insertData
        const groups = await db
            .collection('group')
            .where('year', '==', year)
            .where('type', '==', type)
            .where('city', '==', city)
            .where('district', '==', district)
            .where('expiredAt', '>', dayjs().valueOf())
            .limit(1)
            .get()

        if(!groups.empty) return null
        return await db.collection('group').add({...insertData, expiredAt: null})
    }

    export async function updateGroupExpiredAt(groupId: string) {
        await db.collection('group').doc(groupId).update({
            expiredAt: dayjs().add(15, 'day').valueOf()
        })
    }

    export async function insertCandidateData(
        groupId: string,
        {name, party, deeds}: CandidaData & {deeds: Omit<DeedData, 'groupId'|'candidateId'>[]}
    ) {
        const candidateRef = await db.collection('candidate').add({groupId, name, party})
        await db.collection('picture').doc(candidateRef.id).set({url: await WikiQuery.getCandidatePicture(party, name)})
        for(const deed of deeds) {
            await db.collection('deed').add({groupId, candidateId: candidateRef.id, ...deed})
        }
    }

    export async function getCandidateQuestions(groupId: string) {
        const deeds = await db.collection('deed').where('groupId', '==', groupId).get()
        return deeds.docs.map(v => {
            const question = v.get('question')
            if(typeof question !== 'string') throw new Error
            return {id: v.id, question}
        })
    }

    export async function calculateScore(answers: {id: string, value: number}[]) {
        const answer = answers.at(0)
        if(!answer) return []

        const questionSnapshot = await db.collection('deed').doc(answer.id).get()
        if(!questionSnapshot.exists) return []

        const {groupId} = questionSnapshot.data()!
        if(typeof groupId !== 'string') return []

        const groupSnapshot = await db.collection('group').doc(groupId).get()
        if(!groupSnapshot.exists) return []

        const candidateSnapshots = await db.collection('candidate').where('groupId', '==', groupSnapshot.id).get()
        const deedSnapshots = await db.collection('deed').where('groupId', '==', groupSnapshot.id).get()

        const candidates = candidateSnapshots.docs.map<Selectable<CandidaData>>(doc => ({id: doc.id, ...doc.data() as CandidaData}))
        const deeds = deedSnapshots.docs.map<Selectable<DeedData>>(doc => ({id: doc.id, ...doc.data() as DeedData}))

        return await Promise.all(candidates.map(async ({name, party, status, ...candidate}) => {
            const picSnapshot = await db.collection('picture').doc(candidate.id).get()
            const filteredDeeds = deeds
                .filter(v => v.candidateId === candidate.id)
                .map(({id, description, keyword, question}) => ({description, keyword, question, value: answers.find(v => v.id === id)?.value ?? 0}))
            const score = filteredDeeds.reduce((p, {value}) => p + value, 0) / filteredDeeds.length * 25 + 50
            return {
                name, party, status, score,
                picURL: picSnapshot.get('url') ?? null,
                deeds: filteredDeeds
            }
        }))
    }
}

export namespace Gemini {

    const instance = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY})

    namespace InsertCandidateData {

        const schema = {
            type: 'object',
            properties: {
                name: {
                    type: 'string'
                },
                party: {
                    type: 'string'
                },
                status: {
                    type: 'string'
                },
                deeds: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            description: {
                                type: 'string'
                            },
                            keyword: {
                                type: 'string'
                            },
                            question: {
                                type: 'string'
                            }
                        },
                        required: ['description', 'keyword', 'question']
                    }
                }
            },
            required: ['name', 'party', 'deeds']
        }

        const declaration: FunctionDeclaration = {
            name: 'insertCandidateData',
            parametersJsonSchema: schema
        }

        export const validator = ajv.compile<CandidaData & {deeds: Omit<DeedData, 'groupId'|'candidateId'>[]}>(schema)

        export const config = {
            functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY,
                allowedFunctionNames: ['insertCandidateData'],
            },
            tools: [{functionDeclarations: [declaration]}]
        }

    }

    export async function generateCandidateQuestions(data: PartialGroupData): Promise<{id: string, question: string}[]> {

        async function generate(group?: DocumentReference|null, retry = 3, release?: () => void) {
            if(!retry) {
                await Database.clearPendingGroup(group?.id)
                release?.()
                throw new Error()
            }

            if(!release) release = await FileLock.acquire()
            group = await Database.createGroup(data)
            if(!group) {
                release()
                await new Promise<void>(resolve => setTimeout(resolve, 1000))
                return await generateCandidateQuestions(data)
            }

            const {id: groupId} = group
            const {year, type, city, district} = data
            try {
                const {text} = await instance.models.generateContent({
                    model: 'gemini-3-pro-preview',
                    config: {tools: [{googleSearch: {}}], systemInstruction: prompts.get('makeQuestionaire')?.split('\n')},
                    contents: [{role: 'user', parts: [{text: `${year}年  中華民國 ${city ?? ''} ${district ?? ''} ${type} 候選人`}]}]
                })
                if(!text) throw new Error()

                const {functionCalls} = await instance.models.generateContent({
                    model: 'gemini-2.5-pro',
                    config: {...InsertCandidateData.config, systemInstruction: prompts.get('insertCandidateData')?.split('\n')},
                    contents: [{role: 'user', parts: [{text}]}]
                })
                if(!functionCalls) throw new Error()

                for(const {name, args} of functionCalls) {
                    if(name !== 'insertCandidateData') continue
                    if(!args) throw new Error()
                    if(!InsertCandidateData.validator(args)) throw new Error()
                    await Database.insertCandidateData(groupId, args)
                }
                await Database.updateGroupExpiredAt(groupId)
                release()
                return await Database.getCandidateQuestions(groupId)
            } catch(e) {
                return await generate(group, retry - 1, release)
            } 
        }

        const group = await Database.getLastestGroup(data)
        if(group === null) return await generate()

        const {expiredAt} = group
        if(dayjs().valueOf() > expiredAt) generate()
        
        return await Database.getCandidateQuestions(group.id)
    }
}

export namespace FileLock {

    const lockFilePath = path.resolve('./lock')
    
    export async function acquire() {
        return new Promise<() => void>(resolve => {
            const interval = setInterval(async () => {
                try {
                    const release = await lockfile.lock(lockFilePath)
                    clearInterval(interval)
                    resolve(() => {release()})
                } catch(e) {
                }
            }, 3000)
        })
    }
}

export namespace WikiQuery {

    const validator = ajv.compile<{
        results: {
            bindings: {
                pic: {value: string}
            }[]
        }
    }>({
        type: 'object',
        properties: {
            results: {
                type: 'object',
                properties: {
                    bindings: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                pic: {
                                    type: 'object',
                                    properties: {
                                        value: {
                                            type: 'string'
                                        }
                                    },
                                    required: ['value']
                                }
                            },
                            required: ['pic']
                        }
                    }
                },
                required: ['bindings']
            }
        },
        required: ['results']
    })

    export async function getCandidatePicture(party: string, name: string) {
        try {
            const params = new URLSearchParams({
                format: 'json',
                query: `
                    SELECT ?pic WHERE {
                        ?party rdfs:label "${party}"@zh-hant.
                        ?person rdfs:label "${name}"@zh-hant.
                        ?person wdt:P18 ?pic.
                    } LIMIT 1`
            })
            const res = await fetch(`https://query.wikidata.org/bigdata/namespace/wdq/sparql?${params}`, {
                method: 'GET',
                headers: {'User-Agent': 'PostmanRuntime/7.51.1'}
            })
            const json = await res.json()
            if(!validator(json)) return null

            const binding = json.results.bindings.at(0)
            if(!binding) return null

            return binding.pic.value
        } catch(e) {
            return null
        }
    }
}

export namespace Util {

    export function shuffle<T>(arr: T[]) {
        const set = new Set(arr.map((_, i) => i))
        const output = new Array<T>()
        while(set.size) {
            const idx = Math.floor(Math.random() * set.size)
            const i = Array.from(set.values())[idx]
            output.push(arr[i])
            set.delete(i)
        }
        return output
    }
}