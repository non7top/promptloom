// electron-builder afterPack hook: flips the same Electron fuses that
// @electron-forge/plugin-fuses used to apply, now that packaging no longer
// goes through electron-forge. @electron/fuses itself is forge-independent
// (it just patches the packaged Electron binary), so nothing here is tied
// to electron-builder either — this is the documented way to use it from
// any packager's post-pack hook.
const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function afterPack(context) {
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
};
