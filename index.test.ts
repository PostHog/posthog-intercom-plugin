//@ts-ignore
import { createEvent } from '@posthog/plugin-scaffold/test/utils'

import { getEmailFromEvent, isEmailDomainValid, isEventValid } from './index'

test('isEventValid', async () => {
    const event = createEvent({ event: '$identify' })
    expect(isEventValid('$identify', event.event)).toEqual(true)
    expect(isEventValid('other_event', event.event)).toEqual(false)
    expect(isEventValid('other_event,$identify', event.event)).toEqual(true)
    expect(isEventValid('other_event, $identify, another_event', event.event)).toEqual(true)
})

test('isEmailDomainValid', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const event: any = createEvent({ event: '$identify', email: 'test@test.com' })
    expect(isEmailDomainValid('posthog.com', event.email)).toEqual(true)
    expect(isEmailDomainValid('test.com', event.email)).toEqual(false)
    expect(isEmailDomainValid('posthog.com,test.com', event.email)).toEqual(false)
    expect(isEmailDomainValid('posthog.com, test.com, posthog.io', event.email)).toEqual(false)
})

test('getEmailFromEvent', async () => {
    const event = createEvent({ event: '$identify', distinct_id: 'test@test.com' })
    expect(getEmailFromEvent(event)).toEqual('test@test.com')
    const event2 = createEvent({ event: '$identify', $set: { email: 'test@test.com' } })
    expect(getEmailFromEvent(event2)).toEqual('test@test.com')
    const event3 = createEvent({ event: '$identify', properties: { email: 'test@test.com' } })
    expect(getEmailFromEvent(event3)).toEqual('test@test.com')
    const event4 = createEvent({ event: '$identify', email: 'test@test.com' })
    expect(getEmailFromEvent(event4)).toEqual(null)
})
