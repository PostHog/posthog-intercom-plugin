# PostHog Intercom Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg?style=flat-square)](https://opensource.org/licenses/MIT)

This plugins sends event data to Intercom that match known email contacts.

## Parameters:

-   Intercom API Key (required): you can get this one from the [Intercom Developer Hub](https://developers.intercom.com/building-apps/), by creating a new app and receiving an API Key
-   Triggering events (required): A comma-separated list of PostHog events you want to send to Intercom (e.g.: `$identify,mycustomevent` ).
-   Emails domain to skip (optional): A comma-separated list of email domains to ignore and not send events for in Intercom (e.g. `posthog.com,dev.posthog.com` ).
-   Send events to European data storage (optional, default: False): Send events to api.eu.intercom.com, if you are using Intercom's European Data Hosting.

## Installation

-   Visit 'Project Plugins' under 'Settings'
-   Enable plugins if you haven't already done so
-   Click the 'Repository' tab next to 'Installed'
-   Click 'Install' on this plugin
-   Add your Intercom API key at the configuration step
-   Add triggering events you want to send to Intercom
-   Enable the plugin
