import Ajv, { ValidateFunction } from "ajv";

const ajv = new Ajv()

export const validator: {[key in keyof AjaxRequest]: ValidateFunction<AjaxRequest[key]>} = {
    'start': ajv.compile({
        type: 'object',
        properties: {
            year: {
                type: 'integer'
            },
            type: {
                type: 'string',
                enum: ['總統', '直轄市長', '縣(市)長', '鄉(鎮、市)長', '鄉(鎮、市)民代表', '直轄市山地原住民區長', '直轄市山地原住民區民代表', '立法委員', '直轄市議員', '縣(市)議員']
            },
            city: {
                type: 'string',
                nullable: true
            },
            district: {
                type: 'string',
                nullable: true
            }
        },
        required: ['year', 'type', 'city', 'district'],
        additionalProperties: false
    }),
    'submit': ajv.compile({
        type: 'object',
        properties: {
            answers: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string'
                        },
                        value: {
                            type: 'integer'
                        }
                    },
                    required: ['id', 'value'],
                    additionalProperties: false
                }
            }
        },
        required: ['answers'],
        additionalProperties: false
    })
}