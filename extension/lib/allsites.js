// "Apply on all sites": optional host permission + a persistent content script.
export const SCRIPT_ID = 'accessease-apply';
const ORIGINS = { origins: ['<all_urls>'] };

export const hasAllSitesPermission = () => chrome.permissions.contains(ORIGINS);

/** Call from a user gesture with nothing awaited before it. */
export const requestAllSitesPermission = () => chrome.permissions.request(ORIGINS);

async function isRegistered() {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  return existing.length > 0;
}

export async function unregisterApplyScript() {
  if (await isRegistered()) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
}

// Idempotent: the service worker and the panel can race to register. Never
// unregister first (that would destroy a registration another context just made):
// register, and if the id already exists update it in place.
export async function registerApplyScript() {
  const script = {
    id: SCRIPT_ID,
    matches: ['<all_urls>'],
    js: ['content/apply.js'],
    runAt: 'document_start',
    allFrames: true,
    persistAcrossSessions: true,
  };
  try {
    await chrome.scripting.registerContentScripts([script]);
  } catch (err) {
    if (!(await isRegistered().catch(() => false))) throw err;
    await chrome.scripting.updateContentScripts([script]);
  }
}

export async function disableAllSites() {
  await unregisterApplyScript();
  await chrome.permissions.remove(ORIGINS);
}

/** Make registration match reality (after an update, or if the user revoked access). */
export async function ensureConsistent(allSitesSetting) {
  const granted = await hasAllSitesPermission();
  if (allSitesSetting && granted) {
    if (!(await isRegistered())) await registerApplyScript();
    return true;
  }
  // Setting off, or the user revoked access: nothing may stay registered.
  if (!allSitesSetting || !granted) await unregisterApplyScript();
  return false;
}

/**
 * ensureConsistent against settings that may change under us (another panel or
 * the service worker saving allSites mid-enable): re-read after reconciling and
 * reconcile again if the value moved. Returns the final { settings, ok }.
 */
export async function reconcileFresh(load) {
  let settings = await load();
  let ok = await ensureConsistent(settings.allSites);
  const latest = await load();
  if (latest.allSites !== settings.allSites) {
    settings = latest;
    ok = await ensureConsistent(settings.allSites);
  }
  // Another context may have unregistered in the meantime: do not report ok blindly.
  if (ok && !(await isRegistered())) ok = false;
  return { settings, ok };
}
