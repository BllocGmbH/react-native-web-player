import React, { Component } from 'react'
import HTMLDocument from 'react-html-document'
import ReactDOMServer from 'react-dom/server'
import pureRender from 'pure-render-decorator'

import Phone from './Phone'
import { prefixObject } from '../../utils/PrefixInlineStyles'
import { toBase64 } from '../../utils/Encode'
import * as Networking from '../../utils/Networking'

const styles = prefixObject({
  iframe: {
    flex: '1 1 auto',
    minWidth: 0,
    minHeight: 0,
  },
})

@pureRender
export default class extends Component {

  static defaultProps = {
    platform: 'ios',
    width: 300,
    scale: 1,
    assetRoot: '',
    vendorComponents: [],
    scripts: [],
    playerStyleSheet: '',
    playerCSS: '',
    onError: () => {},
    onRun: () => {},
  }

  constructor(props) {
    super(props)

    this.status = 'loading'
    this.entry = null
    this.messageQueue = []

    this.state = {
      html: null,
    }
  }

  componentDidMount() {
    window.addEventListener('message', this.handleMessage)

    // Creating HTML prior to mount throws errors. The errors probably aren't
    // meaningful, as they're related to the React debugging tools, but creating
    // the HTML here makes them go away.
    this.setState({html: this.createHTML()})
  }

  componentWillUnmount() {
    window.removeEventListener('message', this.handleMessage)
  }

  createHTML = () => {
    const {assetRoot, vendorComponents, scripts, playerStyleSheet, playerCSS} = this.props

    const state = {
      assetRoot,
      vendorComponents,
      playerStyleSheet,
      playerCSS,
    }

    const html = ReactDOMServer.renderToStaticMarkup(
      <HTMLDocument
        title="Web Player"
        metatags={[
          {charSet: 'utf-8'},
        ]}
        scripts={[
          `${window.location.origin}/build/player-bundle.js`,
          `${window.location.origin}/build/react-native-environment-bundle.js`,
          ...scripts,
        ]}
        universalState={state}
      />
    )

    return toBase64('text/html', `<!DOCTYPE html>${html}`)
  }

  runApplication(files, entry) {
    this.props.onRun()

    files.forEach((file) => {
      this.provideComponent({
        name: file.filename,
        code: file.code,
      })
    })

    this.postMessage({
      type: 'app:before',
      payload: {
        name: entry,
      },
    })

    this.postMessage({
      type: 'module:require',
      payload: {
        name: entry,
      },
    })

    this.postMessage({
      type: 'app:after',
      payload: {
        name: entry,
      },
    })
  }

  renderFrame = () => {
    const {html} = this.state

    if (!html) return null

    return (
      <iframe
        style={styles.iframe}
        ref={(ref) => { this.iframe = ref }}
        frameBorder={0}
        src={html}
        onLoad={this.onFrameLoad}
      />
    )
  }

  onFrameLoad = async () => {
    const {vendorComponents} = this.props

    this.status = 'ready'

    await this.provideVendorComponents(vendorComponents)
  }

  provideVendorComponents = async (components) => {
    const fetched = await this.fetchComponents(components)

    fetched.forEach(this.provideComponent)
  }

  provideComponent = ({name, code}) => {
    this.postMessage({
      type: 'module:provide',
      payload: {name, code},
    })
  }

  fetchComponents = async (components) => {
    return Promise.all(
      components.map(async ([name, url]) => {
        const code = await Networking.get(url)
        return {name, code}
      })
    )
  }

  postMessage = (message) => {
    if (!this.iframe) {
      this.messageQueue.push(message)
    }

    if (!message || !message.type) {
      console.error('Invalid message for player', message)

      return
    }

    this.iframe.contentWindow.postMessage(message, '*')
  }

  handleMessage = (event) => {
    let data
    try {
      data = JSON.parse(event.data)
    } catch (err) {
      return
    }

    const {type, payload} = data

    switch (type) {
      case 'error': {
        const {message, line} = payload

        const str = typeof line === 'number'
          ? `${message} (${line})`
          : message

        this.props.onError(str)
        break
      }
    }
  }

  render() {
    const {width, scale, platform} = this.props

    if (platform === 'web') {
      return this.renderFrame()
    }

    return (
      <Phone
        width={width}
        device={platform}
        scale={scale}
      >
        {this.renderFrame()}
      </Phone>
    )
  }
}
