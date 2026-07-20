# Changelog

## [2.0.1](https://github.com/non7top/promptloom/compare/v2.0.0...v2.0.1) (2026-07-20)


### Bug Fixes

* **release:** backfill dispatch should build from current code, not the tag ([0beafb6](https://github.com/non7top/promptloom/commit/0beafb623b876851c958fe1624d12f594eff9ee3))
* **release:** backfill dispatch should build from current code, not the tag ([991178f](https://github.com/non7top/promptloom/commit/991178f535ca4a223d9ff695c5294d61fff5967b))
* **release:** match electron-builder's releaseType to release-please's existing release ([9ba1994](https://github.com/non7top/promptloom/commit/9ba19943fcbcad2a92d5503072adb0c73609902c))
* **release:** match electron-builder's releaseType to release-please's existing release ([1008532](https://github.com/non7top/promptloom/commit/10085329a994ca8d52dded711f520ab08d96cc4b))

## [2.0.0](https://github.com/non7top/promptloom/compare/v1.4.0...v2.0.0) (2026-07-20)


### ⚠ BREAKING CHANGES

* migrate off @electron-forge/plugin-vite to electron-vite + electron-builder

### Features

* add pre-commit config with eslint hook ([228a495](https://github.com/non7top/promptloom/commit/228a495a6f69e11e34114a19f73ec74f78141395))
* add pre-commit config with eslint hook ([74fd389](https://github.com/non7top/promptloom/commit/74fd389aab428eaf6f7ccb0172bdc530a11295fc)), closes [#30](https://github.com/non7top/promptloom/issues/30)
* **ci:** color-code the RELEASE label by predicted bump type ([9d5555e](https://github.com/non7top/promptloom/commit/9d5555ed38b93561ea32e8b70050bece1c117b65))
* **ci:** color-code the RELEASE label by predicted bump type ([d5630e1](https://github.com/non7top/promptloom/commit/d5630e1ada630bd8c657863c0e4e62141fe70762)), closes [#46](https://github.com/non7top/promptloom/issues/46)
* migrate off @electron-forge/plugin-vite to electron-vite + electron-builder ([b71e7cb](https://github.com/non7top/promptloom/commit/b71e7cb07ab5e43a62dcb277387e1415808ee8a7)), closes [#56](https://github.com/non7top/promptloom/issues/56)
* **release:** sign release artifacts with cosign (keyless) ([b5bdadb](https://github.com/non7top/promptloom/commit/b5bdadba9a2efe799111964be131655dc878dae6))
* **release:** sign release artifacts with cosign (keyless) ([e6a1e0f](https://github.com/non7top/promptloom/commit/e6a1e0fde16a3ce93ffc2eb28e27cab6909d37b4))


### Bug Fixes

* **afterpack:** dynamically import @electron/fuses for ESM-only 2.x ([5438915](https://github.com/non7top/promptloom/commit/54389155f7095aa83189913ca2fa66960deb55c5))
* **afterpack:** dynamically import @electron/fuses for ESM-only 2.x ([e5d8d12](https://github.com/non7top/promptloom/commit/e5d8d124c046bcd995f8a7f1ba91b8e95e7f49c0))
* **ci:** don't fail the Release workflow when a merge isn't a release ([33b4ac5](https://github.com/non7top/promptloom/commit/33b4ac5438ed6b0acbe504652dd547c41133a91f))
* **ci:** don't fail the Release workflow when a merge isn't a release ([16c46a1](https://github.com/non7top/promptloom/commit/16c46a130265f5ee418251201a5bfd8f181d863d)), closes [#57](https://github.com/non7top/promptloom/issues/57)

## [1.4.0](https://github.com/non7top/promptloom/compare/v1.3.0...v1.4.0) (2026-07-19)


### Features

* **stash:** let the active stash be set manually ([27558da](https://github.com/non7top/promptloom/commit/27558da9ab8b7a70d99bd87e200c822042d1e8cf))
* **stash:** let the active stash be set manually ([d480854](https://github.com/non7top/promptloom/commit/d4808545ac76a99318c8f03ee23c0a71014cc95a))

## [1.3.0](https://github.com/non7top/promptloom/compare/v1.2.1...v1.3.0) (2026-07-19)


### Features

* **perchance:** mark already-saved images on the page itself ([938956c](https://github.com/non7top/promptloom/commit/938956cd42b5d85a7be1008d7f003cfd13f0bf2e))

## [1.2.1](https://github.com/non7top/promptloom/compare/v1.2.0...v1.2.1) (2026-07-19)


### Bug Fixes

* **ci:** trigger the release workflow off release-please, not push:tags ([37cf37a](https://github.com/non7top/promptloom/commit/37cf37ad25ef538edac0ddc20c17c23a69921043))
* **ci:** trigger the release workflow off release-please, not push:tags ([72d9a05](https://github.com/non7top/promptloom/commit/72d9a0599ed718d47ade472eade4984acf997a59))

## [1.2.0](https://github.com/non7top/promptloom/compare/v1.1.0...v1.2.0) (2026-07-19)


### Features

* **ci:** name PR build artifacts with the predicted version ([2285bf2](https://github.com/non7top/promptloom/commit/2285bf24c6e4b5bacbd4bf545f407e6175f0e06d))
* **definitions:** add export/import for categories and items ([e2ed262](https://github.com/non7top/promptloom/commit/e2ed262ba7f51c2e2e18bd57319ed6b64f393e27))


### Bug Fixes

* **ci:** render the release-please changelog as markdown, not a code block ([b8bd0e3](https://github.com/non7top/promptloom/commit/b8bd0e37408d1b5dc86e7a02ce54cbb536f2755a))
* **ci:** simulate the real merge commit in the release-please preview ([f8898b9](https://github.com/non7top/promptloom/commit/f8898b9d0d3165d39b32d45f60e509fb81a4d376))

## [1.1.0](https://github.com/non7top/promptloom/compare/v1.0.0...v1.1.0) (2026-07-19)


### Features

* **gallery:** lightbox positioning, save feedback, thumbnail cropping, seed format ([15d4265](https://github.com/non7top/promptloom/commit/15d42657df5066f96cd92a82eaa39ab20859a948))


### Bug Fixes

* **composer:** keep Composer mounted across tab switches ([bc51093](https://github.com/non7top/promptloom/commit/bc5109370f3df456e5b3ea67db718f7b689fe335))
* **composer:** name the item, not just the category, in prompt comments ([6056195](https://github.com/non7top/promptloom/commit/605619565077eb7b2f18ec57cabae1274b840543))
* **composer:** put category comments back in the populated prompt ([d3a6e04](https://github.com/non7top/promptloom/commit/d3a6e04c9ce52bfe7094451c2c5c5741c0080b1f))
* **composer:** wire up the seed field, tolerate an already-formatted value ([c9f5930](https://github.com/non7top/promptloom/commit/c9f5930e1017552711f9490b31f6f66a3cd4b01c))
* **gallery:** fix lightbox positioning, save feedback, thumbnail cropping, and seed format ([d4f79fc](https://github.com/non7top/promptloom/commit/d4f79fcc279ecb9274c75eb7dc0925e234e5b86d))

## [1.0.0](https://github.com/non7top/promptloom/compare/promptloom-v0.1.3...promptloom-v1.0.0) (2026-07-17)


### Features

* add release-please dry-run preview comment on PRs ([4080a47](https://github.com/non7top/promptloom/commit/4080a47ec53f3142532ecd25ceba5da49a08afd9))
* add release-please dry-run preview comment on PRs ([7f55f10](https://github.com/non7top/promptloom/commit/7f55f10a735149f85bcdf9f2ab5ecd5cd561add9))


### Bug Fixes

* pass --repo explicitly to gh pr comment (no git context without checkout) ([3599a88](https://github.com/non7top/promptloom/commit/3599a88c93fd0be5c2ffa74a37e74f39b36f8ec5))
* trim preview comment to the relevant summary, link full run ([d638d6e](https://github.com/non7top/promptloom/commit/d638d6e086b8d4e0935111950d5bc84a6ebf2eed))


### Miscellaneous Chores

* bootstrap release-please's first version bump ([8b3ec67](https://github.com/non7top/promptloom/commit/8b3ec67474f2ee83ae5381bca3507f6d17e94a10))
