// electron-builder afterPack hook: flips the same Electron fuses that
// @electron-forge/plugin-fuses used to apply, now that packaging no longer
// goes through electron-forge. @electron/fuses itself is forge-independent
// (it just patches the packaged Electron binary), so nothing here is tied
// to electron-builder either — this is the documented way to use it from
// any packager's post-pack hook.
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  // @electron/fuses is ESM-only as of 2.0.0 (electron/fuses#67) — a plain
  // require() throws ERR_REQUIRE_ESM there, so import it dynamically. Works
  // the same for both the old CJS 1.x and the new ESM 2.x releases.
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  const { appOutDir, packager, electronPlatformName } = context;
  const productFilename = packager.appInfo.productFilename;

  const electronBinaryPath =
    electronPlatformName === 'darwin'
      ? path.join(appOutDir, `${productFilename}.app`, 'Contents', 'MacOS', productFilename)
      : path.join(appOutDir, electronPlatformName === 'win32' ? `${productFilename}.exe` : productFilename);

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });

  if (electronPlatformName === 'win32') {
    await embedProvenanceRepo(electronBinaryPath, packager.config.publish);
  }
};

// sigstore-shell reads this to know which repo's attestations to look up for
// the file. It is only a hint; the verifier trusts the attestation's
// certificate, not this string.
async function embedProvenanceRepo(exePath, publish) {
  const { owner, repo } = publish;
  const { NtExecutable, NtExecutableResource, Resource } = require('resedit');
  const executable = NtExecutable.from(fs.readFileSync(exePath));
  const resources = NtExecutableResource.from(executable);
  const [versionInfo] = Resource.VersionInfo.fromEntries(resources.entries);
  const [language] = versionInfo.getAllLanguagesForStringValues();
  versionInfo.setStringValues(language, { ProvenanceRepo: `${owner}/${repo}` });
  versionInfo.outputToResourceEntries(resources.entries);
  resources.outputResource(executable);
  fs.writeFileSync(exePath, Buffer.from(executable.generate()));
}
