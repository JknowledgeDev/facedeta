const { google } = require('googleapis')
const readline = require('readline')

const CLIENT_ID = '409842690899-hppvdj9pke25n2s6j1ihvl5ql9gqcqm6.apps.googleusercontent.com'
const CLIENT_SECRET = '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'

const oauth2 = new google.auth.OAuth2(
  CLIENT_ID, CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
)

const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive'],
})

console.log('\n=== เปิด URL นี้ใน browser ===\n')
console.log(url)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.question('\nวาง code ที่ได้: ', async (code) => {
  const { tokens } = await oauth2.getToken(code)
  console.log('\n=== REFRESH TOKEN ===\n')
  console.log(tokens.refresh_token)
  rl.close()
})
