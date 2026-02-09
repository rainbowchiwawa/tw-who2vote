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
        candidates: (CandidaData & {
            score: number
            positiveDeeds: DeedData[]
            negativeDeeds: DeedData[]
        })[]
    }
}

declare type AjaxResponseType<T extends keyof AjaxRequest> = T extends keyof AjaxResponse ? AjaxResponse[T] : undefined