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

async function setupPlugin({ config, global }: IntercomMeta) {
    global.intercomUrl =
        config.useEuropeanDataStorage === 'True' ? 'https://api.eu.intercom.com' : 'https://api.intercom.io'
}

async function onEvent(event: PluginEvent, { config, global }: IntercomMeta) {
    if (!isEventValid(config.triggeringEvents, event.event)) {
        return
    }
    const email = getEmailFromEvent(event)
    if (!email) {
        return
    }
    if (!isEmailDomainValid(config.ignoredEmailDomains, email)) {
        return
    }
    const isContactInIntercom = await searchContactInIntercom(global.intercomUrl, config.intercomApiKey, email)
    if (!isContactInIntercom) {
        return
    }

    const date = event['sent_at'] ? new Date(event['sent_at']) : new Date()
    const timestamp = Math.floor(date.getTime() / 1000)

    await sendEventToIntercom(
        global.intercomUrl,
        config.intercomApiKey,
        email,
        event.event,
        event['distinct_id'],
        timestamp
    )
}

async function searchContactInIntercom(url: string, apiKey: string, email: string) {
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
        console.log(
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
            const sendEventResponseJson = sendEventResponse.json() as Record<string, any>
            errorMessage = sendEventResponseJson.errors ? sendEventResponseJson.errors[0].message : ''
        } catch {}
        console.log(
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

export function isEmailDomainValid(ignoredEmailDomains: string, email: string): boolean {
    const emailDomainsToIgnore = (ignoredEmailDomains || '').split(',').map((e) => e.trim())
    if (emailDomainsToIgnore.indexOf(email.split('@')[1]) >= 0) {
        return false
    }
    return true
}

export function isEventValid(triggeringEvents: string, event: string): boolean {
    const validEvents = (triggeringEvents || '').split(',').map((e) => e.trim())
    return validEvents.indexOf(event) >= 0
}
