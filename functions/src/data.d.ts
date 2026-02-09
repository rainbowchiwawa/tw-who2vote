declare type PartialGroupData = {year: number} & ({
    type: '總統'
    city: null
    district: null
} | {
    type: '直轄市長'|'縣(市)長'
    city: string
    district: null
} | {
    type: '鄉(鎮、市)長'|'鄉(鎮、市)民代表'|'直轄市山地原住民區長'|'直轄市山地原住民區民代表'
    city: string
    district: string
} | {
    type: '立法委員'|'直轄市議員'|'縣(市)議員'
    city: string
    district: string
})

declare type GroupData = PartialGroupData & {expiredAt: number|null}

interface CandidaData {
    groupId: string
    name: string
    party: string
}

interface DeedData {
    groupId: string
    candidateId: string
    description: string
    sourceURLs: string[]
    question: string
}

declare type Selectable<T> = {readonly id: string} & Readonly<T>