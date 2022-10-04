import { Plugin, PluginEvent, PluginMeta, RetryError } from '@posthog/plugin-scaffold'
import fetch, { Response } from 'node-fetch'

type IntercomPlugin = Plugin<{
    global: {
        intercomUrl: string
    }
    config: {
        intercomApiKey: string
        triggeringEvents: string
        ignoredEmailDomains: string
        useEuropeanDataStorage: string
    }
}>

type IntercomMeta = PluginMeta<IntercomPlugin>

type JobRequest = {
    email: string
    event: string
    userId: string
    timestamp: number
}

export const jobs = {
    sendToIntercom: async (request: JobRequest, { global, config }: IntercomMeta): Promise<void> => {
        const isContactInIntercom = await searchForContactInIntercom(
            global.intercomUrl,
            config.intercomApiKey,
            request.email
        )
        if (!isContactInIntercom) {
            return
        }
        await sendEventToIntercom(
            global.intercomUrl,
            config.intercomApiKey,
            request.email,
            request.event,
            request.userId,
            request.timestamp
        )
    },
}

export async function setupPlugin({ config, global }: IntercomMeta): Promise<void> {
    global.intercomUrl =
        config.useEuropeanDataStorage === 'Yes' ? 'https://api.eu.intercom.com' : 'https://api.intercom.io'
}

export async function onEvent(event: PluginEvent, { config, jobs }: IntercomMeta): Promise<void> {
    if (!isTriggeringEvent(config.triggeringEvents, event.event)) {
        return
    }

    const email = getEmailFromEvent(event)
    if (!email) {
        console.warn(`This event will not be sent to Intercom because no 'email' was found in the event properties.`)
        return
    }

    if (isIgnoredEmailDomain(config.ignoredEmailDomains, email)) {
        return
    }

    const timestamp = getTimestamp(event)

    await jobs
        .sendToIntercom({
            email,
            event: event.event,
            userId: event['distinct_id'],
            timestamp,
        })
        .runNow()
}

async function searchForContactInIntercom(url: string, apiKey: string, email: string) {
    const searchContactResponse = await fetchWithRetry(
        `${url}/contacts/search`,
        {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                query: {
                    field: 'email',
                    operator: '=',
                    value: email,
                },
            }),
        },
        'POST'
    )
    const searchContactResponseJson = (await searchContactResponse.json()) as Record<string, any>

    if (!statusOk(searchContactResponse) || searchContactResponseJson.errors) {
        const errorMessage = searchContactResponseJson.errors ? searchContactResponseJson.errors[0].message : ''
        console.error(
            `Unable to search contact ${email} in Intercom. Status Code: ${searchContactResponseJson.status}. Error message: ${errorMessage}`
        )
        return false
    } else {
        const found = searchContactResponseJson['total_count'] > 0
        console.log(`Contact ${email} in Intercom ${found ? 'found' : 'not found'}`)
        return found
    }
}

async function sendEventToIntercom(
    url: string,
    apiKey: string,
    email: string,
    event: string,
    distinct_id: string,
    eventSendTime: number
) {
    const sendEventResponse = await fetchWithRetry(
        `${url}/events`,
        {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                event_name: event,
                created_at: eventSendTime,
                email,
                id: distinct_id,
            }),
        },
        'POST'
    )

    if (!statusOk(sendEventResponse)) {
        let errorMessage = ''
        try {
            const sendEventResponseJson = await sendEventResponse.json()
            errorMessage = sendEventResponseJson.errors ? sendEventResponseJson.errors[0].message : ''
        } catch {}
        console.error(
            `Unable to send event ${event} for ${email} to Intercom. Status Code: ${sendEventResponse.status}. Error message: ${errorMessage}`
        )
    } else {
        console.log(`Sent event ${event} for ${email} to Intercom`)
    }
}

async function fetchWithRetry(url: string, options = {}, method = 'GET'): Promise<Response> {
    try {
        const res = await fetch(url, { method: method, ...options })
        return res
    } catch {
        throw new RetryError('Service is down, retry later')
    }
}

function statusOk(res: Response) {
    return String(res.status)[0] === '2'
}

function isEmail(email: string): boolean {
    const re =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    return re.test(String(email).toLowerCase())
}

export function getEmailFromEvent(event: PluginEvent): string | null {
    if (isEmail(event.distinct_id)) {
        return event.distinct_id
    } else if (event['$set'] && Object.keys(event['$set']).includes('email')) {
        if (isEmail(event['$set']['email'])) {
            return event['$set']['email']
        }
    } else if (event['properties'] && Object.keys(event['properties']).includes('email')) {
        if (isEmail(event['properties']['email'])) {
            return event['properties']['email']
        }
    }

    return null
}

export function isIgnoredEmailDomain(ignoredEmailDomains: string, email: string): boolean {
    const emailDomainsToIgnore = (ignoredEmailDomains || '').split(',').map((e) => e.trim())
    return emailDomainsToIgnore.includes(email.split('@')[1])
}

export function isTriggeringEvent(triggeringEvents: string, event: string): boolean {
    const validEvents = (triggeringEvents || '').split(',').map((e) => e.trim())
    return validEvents.indexOf(event) >= 0
}

export function getTimestamp(event: PluginEvent): number {
    try {
        if (event['timestamp']) {
            return Number(event['timestamp'])
        }
    } catch {
        console.error('Event timestamp cannot be parsed as a number')
    }
    const date = event['sent_at'] ? new Date(event['sent_at']) : new Date()
    return Math.floor(date.getTime() / 1000)
}
