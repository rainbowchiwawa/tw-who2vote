import { FunctionCallingConfigMode, FunctionDeclaration, GoogleGenAI } from "@google/genai";
import Ajv from "ajv";
import dayjs from "dayjs";
import { getFirestore } from "firebase-admin/firestore";
import { prompts } from "./prompt";

export namespace Database {
    
    const db = getFirestore()

    export async function init() {
        const snapshots = await db.collection('group').where('pending', '==', true).get()
        for(const {ref} of snapshots.docs) {
            await ref.update({pending: false})
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
        const group = await db
            .collection('group')
            .where('year', '==', year)
            .where('type', '==', type)
            .where('city', '==', city)
            .where('district', '==', district)
            .where('expiredAt', '==', null)
            .limit(1)
            .get()
        if(!group.empty) return null
        return await db.collection('group').add({...insertData, expiredAt: null})
    }

    export async function updateGroupExpiredAt(groupId: string) {
        await db.collection('group').doc(groupId).update({
            expiredAt: dayjs().add(15, 'day').valueOf()
        })
    }

    export async function insertCandidateData(groupId: string, {name, party, deeds}: CandidaData & {deeds: Omit<DeedData, 'groupId'|'candidateId'>[]}) {
        const candidateRef = await db.collection('candidate').add({groupId, name, party: party.toLowerCase()})
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
}

export namespace Gemini {

    const ajv = new Ajv()
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
                deeds: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            description: {
                                type: 'string'
                            },
                            sourceURLs: {
                                type: 'array',
                                items: {
                                    type: 'string'
                                }
                            },
                            question: {
                                type: 'string'
                            }
                        },
                        required: ['description', 'sourceURLs', 'question']
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

    export async function generateCandidateQuestions(data: PartialGroupData) {

        async function generate() {
            const group = await Database.createGroup(data)
            if(!group) return null

            const {id: groupId} = group
            const {year, type, city, district} = data
            try {
                const {text} = await instance.models.generateContent({
                    model: 'gemini-3-pro-preview',
                    config: {tools: [{googleSearch: {}}]},
                    contents: [
                        {role: 'user', parts: [{text: prompts.get('makeQuestionaire')}]},
                        {role: 'user', parts: [{text: `${year}年  中華民國 ${city ?? ''} ${district ?? ''} ${type} 候選人`}]}
                    ]
                })
                if(!text) throw new Error()

                console.log(text)
                const {functionCalls} = await instance.models.generateContent({
                    model: 'gemini-2.5-pro',
                    config: InsertCandidateData.config,
                    contents: [
                        {role: 'user', parts: [{text: prompts.get('insertCandidateData')}]},
                        {role: 'user', parts: [{text}]}
                    ]
                })
                if(!functionCalls) throw new Error()

                for(const {name, args} of functionCalls) {
                    if(name !== 'insertCandidateData') continue
                    console.log(args)
                    if(!args) throw new Error()
                    if(!InsertCandidateData.validator(args)) throw new Error()
                    await Database.insertCandidateData(groupId, args)
                }
                await Database.updateGroupExpiredAt(groupId)
                return await Database.getCandidateQuestions(groupId)
            } catch(e) {
                return null
            }
        }

        const group = await Database.getLastestGroup(data)

        if(group === null) {
            return await generate()
        }

        const {expiredAt} = group
        if(dayjs().valueOf() > expiredAt) generate()
        
        return await Database.getCandidateQuestions(group.id)
    }
}