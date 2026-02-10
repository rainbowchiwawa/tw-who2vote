interface AjaxRequest {
    'start': PartialGroupData
    'submit': {
        answers: {id: string, value: number}[]
    }
}

interface AjaxResponse {
    'start': {
        questions: Pick<Selectable<DeedData>, 'id'|'question'>[]
    }
    'submit': {
        candidates: (Omit<Selectable<CandidaData>, 'id'|'groupId'> & {
            score: number
            picURL: string|null
            deeds: (Omit<DeedData, 'groupId'|'candidateId'> & {value: number})[]
        })[]
    }
}

declare type AjaxResponseType<T extends keyof AjaxRequest> = T extends keyof AjaxResponse ? AjaxResponse[T] : undefined