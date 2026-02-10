import express, { Request, Response } from 'express'
import { validator } from './validator'
import { Database, Gemini, Util } from './service'

const router = express.Router()

function defRoute<T extends keyof AjaxRequest>(
    target: T,
    handler: (req: Request<any, any, AjaxRequest[T]>, res: Response<AjaxResponseType<T>>) => Promise<unknown>
) {
    return router.post(`/api/${target}`, async (req, res) => {
        if(!validator[target](req.body)) {
            res.sendStatus(400)
            return
        }
        await handler(req, res)
    })
}

defRoute('start', async (req, res) => {
    const {type, year} = req.body
    switch(type) {
        case '總統':
        case '立法委員':
            if(year % 4 !== 0) return res.sendStatus(400)
            break
        default:
            if(year % 4 !== 2) return res.sendStatus(400)
    }
    const questions = await Gemini.generateCandidateQuestions(req.body)
    return res.send({questions: Util.shuffle(questions)})
})

defRoute('submit', async (req, res) => {
    const {answers} = req.body
    const candidates = await Database.calculateScore(answers)
    return res.send({candidates: candidates.sort((a, b) => b.score - a.score)})
})

export default router