const fs = require('node:fs')
const path = require('node:path')
const dir = path.join(__dirname, '../paperdock-plugin/src')
const files = ['figures.js', 'host.js', 'client.js']
let failed = false
for (const file of files) {
  const full = path.join(dir, file)
  const source = fs.readFileSync(full, 'utf8')
  try {
    new Function(source)
    console.log('ok   ' + file + ' (' + source.split('\n').length + ' lines)')
  } catch (error) {
    failed = true
    console.log('FAIL ' + file + ': ' + error.message)
  }
}
process.exit(failed ? 1 : 0)
