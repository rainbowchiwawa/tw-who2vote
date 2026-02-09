import fs from 'fs'
import path from 'path'

export const prompts = new Map(
    fs.readdirSync(path.resolve('./prompt'))
        .filter(v => v.endsWith('.md'))
        .map(v => [
            v.replace('.md', ''),
            fs.readFileSync(path.join('./prompt', v)).toString()
        ])
)