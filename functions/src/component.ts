import { Signal, SignalWatcher } from "@lit-labs/signals";
import { html, LitElement } from "lit";
import '@material/web/button/filled-button.js'
import '@material/web/textfield/outlined-text-field.js'
import '@material/web/select/outlined-select.js'
import '@material/web/select/select-option.js'
import '@material/web/radio/radio.js'
import { MdOutlinedSelect } from "@material/web/select/outlined-select.js";
import dayjs from "dayjs";
import { customElement } from "lit/decorators.js";

const endpoint = 'http://127.0.0.1:5001/tw-who2vote/us-central1/https'

async function ajax<T extends keyof AjaxRequest>(target: T, payload: AjaxRequest[T]) {
    const res = await fetch(`${endpoint}/api/${target}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    const text = await res.text()
    return JSON.parse(text) as AjaxResponseType<T>
}

@customElement('w2v-app')
export class W2VApp extends SignalWatcher(LitElement) {

    readonly groupTypes = <const>['總統', '直轄市長']
    readonly groupCities = <const>['台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市']

    readonly groupYear = new Signal.State<number>(dayjs().year())
    readonly groupType = new Signal.State<typeof this.groupTypes[number]>('總統')
    readonly groupCity = new Signal.State<typeof this.groupCities[number]|null>(null)

    readonly questions = new Signal.State<(AjaxResponse['start']['questions'][number] & {value: number})[]>([])
    readonly candidates = new Signal.State<AjaxResponse['submit']['candidates']>([])

    async start() {
        const year = this.groupYear.get()
        const type = this.groupType.get()
        const city = this.groupCity.get()
        const {questions} = await ajax('start', {year, type, city, district: null})
        this.questions.set(questions.map(v => ({...v, value: 0})))
    }

    async submit() {
        const questions = this.questions.get()
        const {candidates} = await ajax('submit', {answers: questions.map(({id, value}) => ({id, value}))})
        this.candidates.set(candidates)
    }

    override render() {
        const type = this.groupType.get()
        const questions = this.questions.get()
        const candidates = this.candidates.get()
        if(candidates.length) {
            return html`
                ${candidates.map(candidate => html`
                    <div>
                        <h1>${`${candidate.score}%`}</h1>
                        <p>${candidate.party}</p>
                        <b>${candidate.name}</b>
                        <img height="300px" src=${candidate.picURL ?? ''} />
                        <ul>
                            ${candidate.deeds.map(deed => html`
                                <li>${deed.value > 0 ? '✅' : deed.value < 0 ? '❌' : '🤔'}&nbsp;${deed.description}&nbsp;<a href=${`https://google.com/search?q=${deed.keyword}`}>查看相關新聞</a></li>
                            `)}
                        </ul>
                    </div>    
                `)}
            `
        }
        if(questions.length) {
            return html`
                ${questions.map(question => html`
                    <div>
                        <p>${question.question}</p>
                        <form>
                            ${[2, 1, 0, -1, -2].map((value, i) => html`
                                <md-radio id=${`radio_${question.id}`} name=${question.id} value=${value} @click=${() => question.value = value}></md-radio>
                                <label for=${`radio_${question.id}`}>${['非常同意', '同意', '普通', '不同意', '非常不同意'][i]}</label>
                            `)}
                        </form>
                    </div>
                `)}
                <md-filled-button @click=${this.submit}>送出</md-filled-button>
            `
        }
        return html`
            <md-outlined-field></md-outlined-field>
            <md-outlined-select @change=${(e: {target: MdOutlinedSelect}) => this.groupType.set(e.target.value as any)}>
                ${this.groupTypes.map(v => html`<md-select-option value=${v}>${v}</md-select-option>`)}
            </md-outlined-select>
            <md-outlined-select @change=${(e: {target: MdOutlinedSelect}) => this.groupCity.set(e.target.value ? e.target.value : null as any)} ?disabled=${type === '總統'}>
                <md-select-option></md-select-option>
                ${this.groupCities.map(v => html`<md-select-option value=${v}>${v}</md-select-option>`)}
            </md-outlined-select>
            <md-filled-button @click=${this.start}>開始</md-filled-button>
        `
    }
}