import assert from 'node:assert/strict'
import test from 'node:test'
import { escapeHtml, htmlParagraphFromText, renderGenericNotificationEmail, renderVerificationEmail } from '../src/index'

test('escapeHtml escapes text and attribute-sensitive characters', () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('x')">`),
    '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;'
  )
})

test('htmlParagraphFromText escapes text before adding line breaks', () => {
  assert.equal(
    htmlParagraphFromText('hello\n<script>alert(1)</script>'),
    '<p>hello<br />&lt;script&gt;alert(1)&lt;/script&gt;</p>'
  )
})

test('verification email uses Planisfy account copy', () => {
  const email = renderVerificationEmail({
    name: 'Ari',
    verifyUrl: 'https://console.planisfy.com/verify-email?token=abc',
  })

  assert.equal(email.subject, 'Verify your Planisfy email address')
  assert.match(email.html, /Verify your email address/)
  assert.match(email.text, /Verify your Planisfy email address/)
})

test('generic notification email escapes html body', () => {
  const email = renderGenericNotificationEmail({
    title: 'Import complete',
    body: '<script>alert(1)</script>',
  })

  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.equal(email.text, '<script>alert(1)</script>')
})
