const request = require('request-promise-native')

class Circle {
  constructor (context) {
    this.context = context
  }

  static get ctx () {
    return 'ci/circleci'
  }

  buildUri ({ owner, repo }, build) { return `https://circleci.com/api/v1.1/project/github/${owner}/${repo}/${build}` }

  parseLog (log) {
    // sp00ky RegExp to start the extraction
    const start = new RegExp(/\r\n|\n/g)

    // The first line can be either \n or \r\n, so
    // we need to know how to offset it.
    const offset = start.exec(log)[0].length

    const end = 'Test failed.  See above for more details.'

    // Get the content between the test and end strings
    let content = log.substring(log.search(start) + offset, log.indexOf(end))

    // Remove the last line, it's usually extra
    content = content.substring(0, content.lastIndexOf('\n'))

    return content
  }

  async serialize () {
    // target_url looks like
    // https://circleci.com/gh/:owner/:repo/:number (see tests/fixtures/circle/build.json)
    const { target_url: targetUrl } = this.context.payload
    const build = /https:\/\/circleci\.com\/gh\/(?:.+?\/){2}(\d+)/g.exec(targetUrl)[1]

    const buildJson = JSON.parse(await request({
      uri: this.buildUri(this.context.repo(), build),
      headers: { Accept: 'application/json' }
    }))

    if (buildJson.pull_requests) {
      const prUrl = buildJson.pull_requests[0].url
      const number = prUrl.substr(prUrl.lastIndexOf('/')).substr(1)

      const ret = { number: parseInt(number, 10) }

      const npmTestStep = buildJson.steps.find(step => step.name === 'npm test')

      const res = JSON.parse(await request({
        uri: npmTestStep.actions[0].output_url,
        gzip: true,
        headers: { Accept: 'application/json' }
      }))

      const content = this.parseLog(res[0].message)
      ret.body = `:sparkles: Good work on this PR so far! :sparkles: Unfortunately, the [Circle CI build](${targetUrl}) is failing. Here's the output:\n\`\`\`\n${content}\n\`\`\`\nI'm sure you can fix it! If you need help, don't hesitate to ask a maintainer of the project!`

      return ret
    } else {
      return false
    }
  }
}

module.exports = Circle