import { fillContact } from './contact.js'

// __CONTACT_EMAIL__ 은 site/build.js 의 define 이 넣는다.
fillContact(document, __CONTACT_EMAIL__)
