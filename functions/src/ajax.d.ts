interface AjaxRequest {
    'start': PartialGroupData
    'submit': {
        answers: {questionId: string, value: number}[]
    }
}

interface AjaxResponse {
    'start': {
        questions: Pick<Selectable<DeedData>, 'id'|'question'>[]
    }
    'submit': {
        candidates: (Omit<Selectable<CandidaData>, 'groupId'> & {
            score: number
            picURL: string
            positiveDeeds: Omit<DeedData, 'groupId'|'candidateId'>[]
            negativeDeeds: Omit<DeedData, 'groupId'|'candidateId'>[]
        })[]
    }
}

declare type AjaxResponseType<T extends keyof AjaxRequest> = T extends keyof AjaxResponse ? AjaxResponse[T] : undefined