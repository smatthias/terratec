// Chromium for the browser checks (browser-smoke.mjs). Playwright's own build is
// used: install it once with `npm run test:browser:install` (the same as
// `npx playwright install --with-deps chromium`). TERRATEC_CHROMIUM may point at
// another Chromium or Chrome executable instead, for machines that cannot
// download Playwright's build (offline, or a network that blocks its CDN).
import {chromium} from 'playwright';

export const INSTALL_HINT='Install it with `npm run test:browser:install` (npx playwright install --with-deps chromium), or set TERRATEC_CHROMIUM to a Chromium or Chrome executable.';

export async function launchChromium(args=[]) {
  const executablePath=process.env.TERRATEC_CHROMIUM||undefined;
  try {
    return await chromium.launch({args,...(executablePath?{executablePath}:{})});
  } catch(error) {
    const missing=/Executable doesn't exist|Failed to launch|ENOENT|spawn/i.test(error.message);
    if(!missing) throw error;
    const which=executablePath?`TERRATEC_CHROMIUM (${executablePath}) could not be started.`:"Playwright's Chromium for the browser checks is not installed.";
    throw Error(`${which}\n${INSTALL_HINT}\n\n${error.message.split('\n')[0]}`,{cause:error});
  }
}
