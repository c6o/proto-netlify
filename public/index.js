const wsSupported = false//'WebSocket' in window
const params = new URLSearchParams(window.location.search)
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
const hasLocalFlag = params.get('l') || params.get('localhost')

// Polling time
const requestInterval = 3000

// URL's depend if we are running in cluster or not
// We can use the hostname to determine configuration
// When localhost, we are doing local development
const localServiceHost = svcName => hasLocalFlag ?
    'localhost' :
    svcName

const coreURL = '/api'

const socketsURL = isLocal ?
    `ws://${localServiceHost('sample-project-sockets')}:8999` :
    `ws://${window.location.host}/sockets`

// State
let coreCounter = 0
let wsClient
let wsLastMessage = 'Pending connection...'

const sectionTemplate = (section, payload) => {
    if (!payload) return ''

    if (payload.error)
        return errorTemplate(section, 'Error', payload.error)

    return `
        <section>
            <div class="ui divider"></div>
            <div class="ui two column grid">
                <div class="row">
                    <div class="column">
                        <h2>${section}</h2>
                    </div>
                </div>
                <div class="row">
                    <div class="column">
                        <table class="ui celled table">
                            <thead>
                                <tr>
                                    <th width="25%">Field</th>
                                    <th>Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.keys(payload).map(key => `<tr>
                                    <td>${key}</td>
                                    <td>${payload[key]}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="column c6o-panel">
                        <h2>&nbsp;</h2>
                        <pre>${JSON.stringify(payload, null, 4)}</pre>
                    </div>
                </div>
            </div>
        </section>
    `
}

const socketTemplate = () => {
    if (!wsSupported)
        return errorTemplate('Sockets', 'Browser issue', 'WebSockets are not supported')
    if (!wsClient)
        return errorTemplate('Sockets', `Socket is closed at ${socketsURL}`)

    return `
        <div class="ui divider"></div>
        <div class="ui grid">
            <div class="row">
                <div class="column">
                    <h2>Sockets</h2>
                </div>
            </div>
            <div class="row">
                <div class="column">
                    ${wsLastMessage}
                </div>
            </div>
        </div>
    `
}

const errorTemplate = (section, title, error = '') => (`
    <div class="ui divider"></div>
    <div class="ui two column grid">
        <div class="row">
            <div class="column">
                <h2>${section}</h2>
            </div>
        </div>
        <div class="ui icon message">
            <i class="exclamation triangle icon" style="color: red;"></i>
            <div class="content">
                <div class="header">
                    ${title}
                </div>
                <p>${error}</p>
            </div>
        </div>
    </div><p>&nbsp;</p>
`)

const beginSockets = () => {
    if (!wsSupported) return
    if (wsClient) return

    wsClient = new WebSocket(socketsURL)
    wsClient.onopen = () => {
        $('#socket-send').removeClass('disabled')
        $('#socket-toggle').html('Disconnect')

    }
    wsClient.onclose = () => {
        $('#socket-send').addClass('disabled')
        $('#socket-broadcast').addClass('disabled')
        delete wsClient
        wsClient = null
        $('#socket-toggle').html('Connect')
    }

    wsClient.onmessage = (evt) => wsLastMessage = evt.data
    wsClient.onerror = (err) => {
        console.error(err)
        setTimeout(beginSockets, 1000)
    }
}

socketToggleClicked = () => {
    wsClient ?
        wsClient.close() :
        beginSockets()
}

socketBroadcastClicked = () => {
    const element = $('#socket-input')[0]
    wsClient.send(`broadcast: ${element.value}`)
    element.value = ''
    $('#socket-broadcast').addClass('disabled')
}

socketInputKeydown = (e) => {
    if (e.target.value.length)
        $('#socket-broadcast').removeClass('disabled')
    if (e.keyCode === 13) {
        wsClient.send(e.target.value)
        e.target.value = ''
        $('#socket-broadcast').addClass('disabled')
    }
}

const callCore = () => {
    $.ajax({
        url: coreURL,
        type: "GET",
        data: { "Content-Type": undefined },
        success: (result) => {
            // check that result is an object as we are expecting.
            // Middleware can potentially return a string
            if (typeof result === 'object' && result !== null) {
                const { mongo, leaf, file, ...core } = result
                const content =
                    sectionTemplate('Core', { url: coreURL, ...core }) +
                    sectionTemplate('Leaf', leaf) +
                    sectionTemplate('Database', mongo)
                $('#data-dump').html(content)
            }
        },
        error: (err) => {
            console.error(err)
            const content =
                socketTemplate() +
                errorTemplate('Core', `Failed to reach ${coreURL}`, `The sample-project-core service may have failed to start or is still spinning up.`)
            $('#data-dump').html(content)
        }
    })

    $('#coreCounter').html(++coreCounter)
}

$(document).ready(() => {
    $(document).on('click', "#socket-toggle", socketToggleClicked)
    $(document).on('click', "#socket-broadcast", socketBroadcastClicked)
    $(document).on('keydown', '#socket-input', socketInputKeydown)

    // Call the core API every interval
    setInterval(callCore, requestInterval)

    // Start a sockets connection
    beginSockets()
})
