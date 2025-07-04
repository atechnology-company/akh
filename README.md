# akh 0.3.4-alpha
the utilitarian muslim companion

written in svelte with help from
- [adhan](https://github.com/batoulapps/adhan-js)([MIT](https://raw.githubusercontent.com/batoulapps/Adhan/refs/heads/master/LICENSE))
- [al adhan api](https://aladhan.com/) for hijri date
- [nativescript for mobile](https://nativescript.org/)
- [firebase](https://firebase.google/)
- [king fahad quran printing complex fonts from here](https://github.com/nuqayah/qpc-fonts)
- [gemini 2.5 flash](https://ai.google.dev/gemini-api/docs/models)
- [quran and tafseer api](https://quranapi.pages.dev)
- [openstreetmap](https://www.openstreetmap.org/)

do not use this for religious advice please, or at least take what you get with a grain of salt and do your own research

mobile android is yet to be fully coded and properly tested, pls help

about page background animation inspired by [manus](https://manus.im/login)

with help from github copilot, [trae](https://trae.ai/) and [cursor](https://cursor.com/)

## alif
Artificial Learning Integration for Fataawa

alif is an ai-powered search engine, using the [plates engine](https://github.com/atechnology-company/plates-mobile)

using gemini 2.5 flash along with access to a wide base of pre-existing verified fataawa from a list of verifiable sources, you can input scenarios or complex queries for ai to dismantle, understand and provide relevant digestible rulings from verified sources

this software is released under the Mozilla Public License Version 2.0, but it honestly isn't really that deep just yet so just do whatever you want, it isn't like i'm bothered enough to sue anyone or take legal action.

### todo
- allow users to use multiple providers (gpt, gemini, claude etc)
- gradual minimal drawn animation changing throughout the day and based on weather
- make hadith reader
- fix nativescript to build applications
- mobile app version
- alif needs update to be in line with current plates engine and it needs to be faster
- make mosques page better (auth, events update like a tg channel, once app is done set defaults etc)
- mosque public limitations and auth
- which rakat the imam is on based on audio recognition
- surah recognition
- need to think about verse by verse implementation, how to not reload but go up a verse through scrolling
- full codebase migration to tailwindcss
- fix compass in 0.3.2
- make audio play more than one verse (autoscroll)
- fix settings view on mobile as it is cut off
- make a new welcome phase and tutorial
- spotify wrapped but for salah response rate and masjid percentage prayed

### 0.3 update
- qibla page fixed with design changes for minimalism and qol, moved from google maps api to openstreetmap
- we have a quran page
- alif api key modal update
- bumped engine to gemini 2.5 flash
- shake to switch page on mobile
- updated page switcher
- added umami analytics, i just want to see traffic
- and more optimisations and bug fixes

### 0.3.1
- carousel mode WOOOOOO
- no more janky swiping :)) no problem
- added version indicator in the bottom left of the about page

### 0.3.2
- qibla improvements

### 0.3.3
- attempting qibla fixes
- quran qol improvements
- added tafseer

### 0.3.4
- changed from amiri font to king fahad quran printing complex fonts
- updated readme

### 0.3.5
- fixing shake on ios
- currently working on process of migrating to tauri
