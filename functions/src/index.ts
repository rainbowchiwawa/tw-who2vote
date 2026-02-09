import './instrumental'

import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import router from './router'
import path from 'path'
import timeout from 'connect-timeout'
import { onRequest } from 'firebase-functions/https'
import { Database } from './service'

const app = express()
app.use(express.static(path.resolve('./prompt')))
app.use(express.json())
app.use(timeout(600000))
app.use(router)

Database.init()

export const https = onRequest({cors: true, timeoutSeconds: 600}, app)