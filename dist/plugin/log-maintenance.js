import { createReadStream, createWriteStream, existsSync, promises as fs, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { getLogsDir } from './paths.js';
const MEBIBYTE = 1024 * 1024;
const MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;
const FOLLOW_UP_DELAY_MS = 250;
const MAX_MANAGED_FILES = 1000;
const MAX_DELETIONS_PER_RUN = 5000;
const MAX_COMPRESSIONS_PER_RUN = 16;
const STALE_CLAIM_MS = 10 * 60 * 1000;
const DEFAULT_OPTIONS = {
    log_retention_days: 7,
    log_max_total_size_mb: 512,
    log_compress_after_days: 1
};
let options = { ...DEFAULT_OPTIONS };
let maintenanceTimer;
let maintenancePromise;
let lastMaintenanceAt = 0;
function isMissingFile(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT');
}
function isManagedLog(name) {
    return (name === 'plugin.log' ||
        name.endsWith('.ndjson') ||
        name.endsWith('.ndjson.ready') ||
        name.endsWith('.ndjson.gz') ||
        name.endsWith('.log.ready') ||
        name.endsWith('.log.gz') ||
        name.endsWith('_request.json') ||
        name.endsWith('_response.json') ||
        name.includes('.compressing-') ||
        name.includes('.tmp-'));
}
function isActiveLog(name) {
    return (name === 'plugin.log' ||
        name.endsWith('.ndjson') ||
        name.includes('.compressing-') ||
        name.includes('.tmp-'));
}
function isTemporaryLog(name) {
    return name.includes('.compressing-') || name.includes('.tmp-');
}
function isReadyLog(name) {
    return name.endsWith('.ndjson.ready') || name.endsWith('.log.ready');
}
function isRawApiSegment(name) {
    return name.startsWith('api-') && name.endsWith('.ndjson');
}
function ageKey(name) {
    const match = name.match(/\d{4}-\d{2}-\d{2}(?:T\d{2}-\d{2}-\d{2})?/);
    return match?.[0] ?? name;
}
function deletableNames(entries) {
    return entries
        .filter((entry) => entry.isFile() && isManagedLog(entry.name) && !isActiveLog(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => ageKey(a).localeCompare(ageKey(b)) || a.localeCompare(b));
}
async function removeFiles(paths) {
    let removed = 0;
    const concurrency = 32;
    for (let offset = 0; offset < paths.length; offset += concurrency) {
        const batch = paths.slice(offset, offset + concurrency);
        const results = await Promise.all(batch.map(async (path) => {
            try {
                await fs.unlink(path);
                return true;
            }
            catch (error) {
                if (isMissingFile(error))
                    return false;
                return false;
            }
        }));
        removed += results.filter(Boolean).length;
    }
    return removed;
}
async function readManagedFiles(dir, entries) {
    const names = entries
        .filter((entry) => entry.isFile() && isManagedLog(entry.name))
        .map((entry) => entry.name);
    const files = [];
    const concurrency = 32;
    for (let offset = 0; offset < names.length; offset += concurrency) {
        const batch = names.slice(offset, offset + concurrency);
        const stats = await Promise.all(batch.map(async (name) => {
            const path = join(dir, name);
            try {
                return { name, path, stats: await fs.stat(path) };
            }
            catch {
                return null;
            }
        }));
        files.push(...stats.filter((file) => file !== null));
    }
    return files;
}
async function recoverStaleClaims(files, now) {
    let recovered = false;
    for (const file of files) {
        if (file.name.includes('.tmp-') && now - file.stats.mtimeMs >= STALE_CLAIM_MS) {
            try {
                await fs.unlink(file.path);
                recovered = true;
            }
            catch { }
            continue;
        }
        const marker = file.name.lastIndexOf('.compressing-');
        if (marker < 0 || now - file.stats.mtimeMs < STALE_CLAIM_MS)
            continue;
        const original = join(getLogsDir(), file.name.slice(0, marker));
        const base = original.endsWith('.ready') ? original.slice(0, -'.ready'.length) : original;
        const compressed = `${base}.gz`;
        try {
            if (existsSync(original) || existsSync(compressed)) {
                await fs.unlink(file.path);
            }
            else {
                await fs.rename(file.path, original);
            }
            recovered = true;
        }
        catch { }
    }
    return recovered;
}
async function markInactiveSegmentsReady(files, now) {
    const compressBefore = now - options.log_compress_after_days * 24 * 60 * 60 * 1000;
    let marked = false;
    for (const file of files) {
        if (!isRawApiSegment(file.name) || file.stats.mtimeMs > compressBefore)
            continue;
        try {
            await fs.rename(file.path, `${file.path}.ready`);
            marked = true;
        }
        catch { }
    }
    return marked;
}
async function compressReadyFile(path) {
    const claim = `${path}.compressing-${process.pid}-${Date.now()}`;
    try {
        await fs.rename(path, claim);
    }
    catch {
        return false;
    }
    const base = path.endsWith('.ready') ? path.slice(0, -'.ready'.length) : path;
    let target = `${base}.gz`;
    if (existsSync(target)) {
        const id = `${process.pid}-${Date.now()}`;
        if (base.endsWith('.ndjson')) {
            target = `${base.slice(0, -'.ndjson'.length)}-${id}.ndjson.gz`;
        }
        else if (base.endsWith('.log')) {
            target = `${base.slice(0, -'.log'.length)}-${id}.log.gz`;
        }
        else {
            target = `${base}-${id}.gz`;
        }
    }
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    let published = false;
    try {
        await pipeline(createReadStream(claim), createGzip({ level: 6 }), createWriteStream(temporary, { flags: 'wx' }));
        await fs.rename(temporary, target);
        published = true;
        try {
            await fs.unlink(claim);
        }
        catch { }
        return true;
    }
    catch {
        try {
            await fs.unlink(temporary);
        }
        catch { }
        try {
            if (!published && !existsSync(path))
                await fs.rename(claim, path);
        }
        catch { }
        return false;
    }
}
async function compressReadyFiles(files) {
    const ready = files
        .filter((file) => isReadyLog(file.name))
        .sort((a, b) => a.stats.mtimeMs - b.stats.mtimeMs);
    const batch = ready.slice(0, MAX_COMPRESSIONS_PER_RUN);
    let compressed = 0;
    for (const file of batch) {
        if (await compressReadyFile(file.path))
            compressed++;
    }
    return compressed > 0 && ready.length > batch.length;
}
async function enforceRetention(files, now) {
    const retainAfter = now - options.log_retention_days * 24 * 60 * 60 * 1000;
    const expired = files
        .filter((file) => !isActiveLog(file.name) && file.stats.mtimeMs < retainAfter)
        .sort((a, b) => a.stats.mtimeMs - b.stats.mtimeMs);
    const batch = expired.slice(0, MAX_DELETIONS_PER_RUN);
    return (await removeFiles(batch.map((file) => file.path))) > 0;
}
async function enforceTotalSize(files) {
    const maxBytes = options.log_max_total_size_mb * MEBIBYTE;
    let totalBytes = files
        .filter((file) => !isTemporaryLog(file.name))
        .reduce((sum, file) => sum + file.stats.size, 0);
    if (totalBytes <= maxBytes)
        return false;
    const candidates = files
        .filter((file) => !isActiveLog(file.name))
        .sort((a, b) => a.stats.mtimeMs - b.stats.mtimeMs);
    const removals = [];
    for (const file of candidates) {
        if (totalBytes <= maxBytes || removals.length >= MAX_DELETIONS_PER_RUN)
            break;
        totalBytes -= file.stats.size;
        removals.push(file.path);
    }
    return (await removeFiles(removals)) > 0;
}
async function maintainOnce() {
    const dir = getLogsDir();
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    }
    catch (error) {
        if (isMissingFile(error))
            return false;
        return false;
    }
    const managedEntries = entries.filter((entry) => entry.isFile() && isManagedLog(entry.name));
    if (managedEntries.length > MAX_MANAGED_FILES) {
        const candidates = deletableNames(managedEntries);
        const excess = managedEntries.length - MAX_MANAGED_FILES;
        const batch = candidates.slice(0, Math.min(excess, MAX_DELETIONS_PER_RUN));
        const removed = await removeFiles(batch.map((name) => join(dir, name)));
        const remainingManaged = managedEntries.length - removed;
        const remainingDeletable = candidates.length - removed;
        return removed > 0 && remainingManaged > MAX_MANAGED_FILES && remainingDeletable > 0;
    }
    const files = await readManagedFiles(dir, managedEntries);
    const now = Date.now();
    if (await recoverStaleClaims(files, now))
        return true;
    if (await enforceRetention(files, now))
        return true;
    if (await markInactiveSegmentsReady(files, now))
        return true;
    if (await enforceTotalSize(files))
        return true;
    if (await compressReadyFiles(files))
        return true;
    return false;
}
function queueMaintenance(delayMs) {
    if (maintenanceTimer)
        return;
    maintenanceTimer = setTimeout(() => {
        maintenanceTimer = undefined;
        void runLogMaintenance();
    }, delayMs);
    maintenanceTimer.unref?.();
}
export function configureLogMaintenance(next) {
    options = { ...next };
    scheduleLogMaintenance();
}
export function scheduleLogMaintenance() {
    const elapsed = Date.now() - lastMaintenanceAt;
    const delay = lastMaintenanceAt === 0 ? 250 : Math.max(250, MAINTENANCE_INTERVAL_MS - elapsed);
    queueMaintenance(delay);
}
export async function runLogMaintenance() {
    if (maintenanceTimer)
        clearTimeout(maintenanceTimer);
    maintenanceTimer = undefined;
    if (maintenancePromise)
        return maintenancePromise;
    maintenancePromise = (async () => {
        let needsFollowUp = false;
        try {
            needsFollowUp = await maintainOnce();
            lastMaintenanceAt = Date.now();
        }
        catch {
            lastMaintenanceAt = Date.now();
        }
        finally {
            maintenancePromise = undefined;
            if (needsFollowUp)
                queueMaintenance(FOLLOW_UP_DELAY_MS);
        }
    })();
    return maintenancePromise;
}
export function markLogReady(path) {
    if (!existsSync(path))
        return;
    try {
        renameSync(path, `${path}.ready`);
    }
    catch { }
    scheduleLogMaintenance();
}
export function ensureLogsDir() {
    const dir = getLogsDir();
    mkdirSync(dir, { recursive: true });
    return dir;
}
export function shouldRotateLog(path, maxBytes, additionalBytes = 0) {
    try {
        return statSync(path).size + additionalBytes > maxBytes;
    }
    catch {
        return false;
    }
}
export function resetLogMaintenanceForTests() {
    if (maintenanceTimer)
        clearTimeout(maintenanceTimer);
    maintenanceTimer = undefined;
    lastMaintenanceAt = 0;
    options = { ...DEFAULT_OPTIONS };
}
