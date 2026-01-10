// X4 Save File Parser - JavaScript implementation of x4-vault-finder.py

// Initialize empty data structure
window.data = { sectors: {} };

class X4SaveParser {
    constructor(sectorNames, shipNames, positions, strings) {
        this.sectorNames = sectorNames;
        this.shipNames = shipNames;
        this.positions = positions;
        this.strings = strings;
        
        this.componentPositions = {};
        this.currentSector = null;
        this.currentResourceArea = null;
        this.data = { sectors: {} };
        this.sectorMacroOfConnectionId = {};
        
        this.lastEntrygateId = null;
        this.lastExitgateId = null;
        this.superHighwayStep = {};
        
        this.REFERENCE = /\{(\d*),\s*(\d+)\}/g;
        this.PARENTHESES = /^(.*)\([^)]*\)(.*)$/;
        
        this.onProgress = null;
    }

    resolveName(s) {
        const seen = new Set();
        while (true) {
            this.REFERENCE.lastIndex = 0;
            const matchObj = this.REFERENCE.exec(s);
            if (matchObj === null) break;
            
            const left = s.substring(0, matchObj.index);
            const right = s.substring(matchObj.index + matchObj[0].length);
            const first = matchObj[1] !== '' ? matchObj[1] : this.pageId;
            const second = matchObj[2];
            const tag = `${first},${second}`;
            
            let replacement = '';
            if (!seen.has(tag)) {
                seen.add(tag);
                try {
                    replacement = this.strings[first]?.[second] || '';
                } catch (e) {
                    replacement = '';
                }
            }
            s = left + replacement + right;
        }
        
        while (true) {
            const matchObj = this.PARENTHESES.exec(s);
            if (matchObj === null) break;
            s = matchObj[1] + matchObj[2];
        }
        
        return s;
    }

    getShipName(shipId) {
        const rawName = this.shipNames[shipId] || shipId;
        return this.resolveName(rawName);
    }

    getSectorName(sectorId) {
        const rawName = this.sectorNames[this.currentSector] || this.currentSector;
        return this.resolveName(rawName);
    }

    isAt(path, expected) {
        const expectedParts = expected.split('/');
        if (path.length < expectedParts.length) return false;
        const lastNPathElements = path.slice(-expectedParts.length);
        return lastNPathElements.every((elem, i) => elem.tag === expectedParts[i]);
    }

    isSector(path) {
        const last = path[path.length - 1];
        return last.tag === 'component' && last.attrib['class'] === 'sector';
    }

    isStation(path) {
        const last = path[path.length - 1];
        return last.tag === 'component' && last.attrib['class'] === 'station';
    }

    isAbandonedShip(path) {
        const last = path[path.length - 1];
        return (
            last.tag === 'component' &&
            (last.attrib['class'] || '').startsWith('ship_') &&
            last.attrib['owner'] === 'ownerless'
        );
    }

    isSectorGate(path) {
        const last = path[path.length - 1];
        const secondLast = path[path.length - 2];
        return (
            last.tag === 'component' &&
            secondLast?.tag === 'connection' &&
            (secondLast.attrib['connection'] || '').startsWith('connection_clustergate')
        );
    }

    isSuperHighwayGate(path) {
        const last = path[path.length - 1];
        return (
            last.tag === 'component' &&
            ['highwayentrygate', 'highwayexitgate'].includes(last.attrib['class'] || '') &&
            (last.attrib['macro'] || '').includes('superhighway')
        );
    }

    isVault(path) {
        const last = path[path.length - 1];
        return last.tag === 'component' && (
            last.attrib['class'] === 'datavault' ||
            (last.attrib['macro'] || '').includes('erlking_vault')
        );
    }

    isVaultLoot(path) {
        if (path.length < 4) return false;
        const last = path[path.length - 1];
        const clazz = last.attrib['class'] || '';
        return (
            last.tag === 'component' &&
            ['collectablewares', 'collectableblueprints', 'signalleak'].includes(clazz) &&
            this.isVault(path.slice(0, -3))
        );
    }

    isGateConnected(path) {
        const last = path[path.length - 1];
        const secondLast = path[path.length - 2];
        
        return (
            (last.tag === 'connected' &&
             ((secondLast?.attrib['connection'] || '') === 'destination' ||
              (secondLast?.attrib['connection'] || '').startsWith('clustergate')) &&
             this.isSectorGate(path.slice(0, -3)))
        ) || (
            last.tag === 'connected' &&
            this.isSuperHighwayGate(path.slice(0, -3))
        );
    }

    isSuperHighwayStepEntry(path) {
        const last = path[path.length - 1];
        return last.tag === 'connection' && last.attrib['connection'] === 'entrygate';
    }

    isSuperHighwayStepExit(path) {
        const last = path[path.length - 1];
        return last.tag === 'connection' && last.attrib['connection'] === 'exitgate';
    }

    isGateActivity(path) {
        const last = path[path.length - 1];
        return last.tag === 'object' && (
            this.isSectorGate(path.slice(0, -1)) ||
            this.isSuperHighwayGate(path.slice(0, -1))
        );
    }

    maybeStoreComponentPosition(path) {
        if (this.isAt(path, 'component/offset/position')) {
            const last = path[path.length - 1];
            const x = parseFloat(last.attrib['x'] || '0');
            const y = parseFloat(last.attrib['y'] || '0');
            const z = parseFloat(last.attrib['z'] || '0');
            const code = path[path.length - 3].attrib['code'];
            this.componentPositions[code] = [x, y, z];
        }
    }

    maybeStoreObject(path) {
        const attrib = path[path.length - 1].attrib;
        
        if (this.isSector(path)) {
            this.currentSector = attrib['macro'];
            this.data.sectors[this.currentSector] = {
                name: this.getSectorName(this.currentSector),
                is_known: attrib['known'] === '1' || attrib['knownto'] === 'player',
                objects: {},
                resource_areas: []
            };
        } else if (this.isStation(path) || this.isSectorGate(path) || this.isSuperHighwayGate(path) || this.isVault(path) || this.isAbandonedShip(path)) {
            const code = attrib['code'];
            let macro;
            
            if (this.isSectorGate(path)) {
                macro = (path[path.length - 2].attrib['connection'] || '').toLowerCase();
            } else if (this.isAbandonedShip(path)) {
                macro = this.getShipName(attrib['macro'] || '');
            } else {
                macro = attrib['macro'] || '';
            }
            
            if (!this.data.sectors[this.currentSector]) return;
            
            this.data.sectors[this.currentSector].objects[code] = {
                class: attrib['class'] || '',
                code: code,
                macro: macro,
                owner: attrib['owner'] || ''
            };
            
            if (this.isStation(path) && path[path.length - 1].attrib['state'] === 'wreck') {
                this.data.sectors[this.currentSector].objects[code].is_wreck = true;
            }
            if (this.isVault(path)) {
                this.data.sectors[this.currentSector].objects[code].has_blueprints = false;
                this.data.sectors[this.currentSector].objects[code].has_signalleak = false;
                this.data.sectors[this.currentSector].objects[code].has_wares = false;
            }
            if (this.isSectorGate(path) || this.isSuperHighwayGate(path)) {
                this.data.sectors[this.currentSector].objects[code].is_active = true;
            }
            if (this.isStation(path) && path[path.length - 1].attrib['factionheadquarters'] === '1') {
                this.data.sectors[this.currentSector].objects[code].is_headquarter = true;
            }
        } else if (this.isVaultLoot(path)) {
            const vaultCode = path[path.length - 4].attrib['code'];
            const clazz = path[path.length - 1].attrib['class'] || '';
            
            if (!this.data.sectors[this.currentSector]?.objects[vaultCode]) return;
            
            if (clazz === 'collectableblueprints') {
                this.data.sectors[this.currentSector].objects[vaultCode].has_blueprints = true;
            }
            if (clazz === 'signalleak') {
                this.data.sectors[this.currentSector].objects[vaultCode].has_signalleak = true;
            }
            if (clazz === 'collectablewares') {
                this.data.sectors[this.currentSector].objects[vaultCode].has_wares = true;
            }
        } else if (this.isGateConnected(path)) {
            const gateComponent = path[path.length - 4];
            const code = gateComponent.attrib['code'];
            const clazz = gateComponent.attrib['class'];
            const connection = path[path.length - 2];
            const outerId = connection.attrib['id'];
            const connected = path[path.length - 1];
            const innerId = connected.attrib['connection'];
            
            this.sectorMacroOfConnectionId[innerId] = this.currentSector;
            
            if (!this.data.sectors[this.currentSector]?.objects[code]) return;
            
            if (clazz === 'gate') {
                this.data.sectors[this.currentSector].objects[code].target_id = outerId;
            } else {
                this.data.sectors[this.currentSector].objects[code].target_id = innerId;
            }
        } else if (this.isSuperHighwayStepEntry(path)) {
            this.lastEntrygateId = path[path.length - 1].attrib['id'];
        } else if (this.isSuperHighwayStepExit(path)) {
            this.lastExitgateId = path[path.length - 1].attrib['id'];
        } else if (this.isGateActivity(path)) {
            const code = path[path.length - 2].attrib['code'];
            if (this.data.sectors[this.currentSector]?.objects[code]) {
                this.data.sectors[this.currentSector].objects[code].is_active = 
                    path[path.length - 1].attrib['active'] !== '0';
            }
        }
    }

    maybeStoreSuperHighwayStep(path) {
        const last = path[path.length - 1];
        if (last.tag !== 'component' || last.attrib['class'] !== 'highway') return;
        
        this.superHighwayStep[this.lastEntrygateId] = this.lastExitgateId;
        this.superHighwayStep[this.lastExitgateId] = this.lastEntrygateId;
    }

    maybeStorePosition(path) {
        if (!(this.isStation(path) || this.isSectorGate(path) || this.isSuperHighwayGate(path) || this.isVault(path) || this.isAbandonedShip(path))) {
            return;
        }
        
        const position = [0, 0, 0];
        
        for (const elem of path) {
            if (elem.tag !== 'component') continue;
            const code = elem.attrib['code'];
            const p = this.componentPositions[code] || [0, 0, 0];
            position[0] += p[0];
            position[1] += p[1];
            position[2] += p[2];
            
            const macro = elem.attrib['macro'] || null;
            const offset = this.positions[macro];
            if (offset) {
                position[0] += offset.x;
                position[1] += offset.y;
                position[2] += offset.z;
            }
        }
        
        for (const elem of path) {
            if (elem.tag !== 'connection') continue;
            const gateId = elem.attrib['connection'] || null;
            if (gateId === null || !gateId.startsWith('connection_clustergate')) continue;
            
            const offset = this.positions[gateId];
            if (offset) {
                position[0] += offset.x;
                position[1] += offset.y;
                position[2] += offset.z;
            }
        }
        
        const code = path[path.length - 1].attrib['code'];
        if (this.data.sectors[this.currentSector]?.objects[code]) {
            this.data.sectors[this.currentSector].objects[code].x = position[0];
            this.data.sectors[this.currentSector].objects[code].y = position[1];
            this.data.sectors[this.currentSector].objects[code].z = position[2];
        }
    }

    maybeStoreResourceStart(path) {
        if (this.isAt(path, 'resourceareas/area')) {
            const last = path[path.length - 1];
            this.currentResourceArea = {
                x: parseInt(last.attrib['x'] || '0'),
                y: parseInt(last.attrib['y'] || '0'),
                z: parseInt(last.attrib['z'] || '0'),
                resources: {}
            };
        } else if (this.isAt(path, 'resourceareas/area/wares/ware/recharge')) {
            const resourceName = path[path.length - 2].attrib['ware'];
            if (!this.currentResourceArea.resources[resourceName]) {
                this.currentResourceArea.resources[resourceName] = {};
            }
            const last = path[path.length - 1];
            const rechargeMax = parseInt(last.attrib['max'] || '0');
            const rechargeCurrent = last.attrib['current'];
            const rechargeTime = parseInt(last.attrib['time'] || '0');
            
            this.currentResourceArea.resources[resourceName].recharge_max = rechargeMax;
            this.currentResourceArea.resources[resourceName].recharge_current = 
                rechargeCurrent === undefined ? rechargeMax : parseInt(rechargeCurrent);
            this.currentResourceArea.resources[resourceName].recharge_time = rechargeTime;
        } else if (this.isAt(path, 'resourceareas/area/yields/ware/yield')) {
            const resourceName = path[path.length - 2].attrib['ware'];
            if (!this.currentResourceArea.resources[resourceName]) {
                this.currentResourceArea.resources[resourceName] = {};
            }
            this.currentResourceArea.resources[resourceName].yield = 
                path[path.length - 1].attrib['name'] || '';
        }
    }

    maybeStoreResourceEnd(path) {
        const last = path[path.length - 1];
        const secondLast = path[path.length - 2];
        
        if (last.tag === 'area' && secondLast?.tag === 'resourceareas') {
            if (this.currentResourceArea && this.data.sectors[this.currentSector]) {
                this.data.sectors[this.currentSector].resource_areas.push(this.currentResourceArea);
            }
            this.currentResourceArea = null;
        }
    }

    writeGateTargetSectors() {
        for (const sector of Object.values(this.data.sectors)) {
            for (const o of Object.values(sector.objects)) {
                if (!['gate', 'highwayentrygate', 'highwayexitgate'].includes(o.class)) continue;
                
                let targetId = o.target_id || null;
                if (['highwayentrygate', 'highwayexitgate'].includes(o.class)) {
                    targetId = this.superHighwayStep[targetId];
                }
                if (targetId === null || targetId === undefined) continue;
                
                const targetSectorMacro = this.sectorMacroOfConnectionId[targetId] || '';
                const targetSectorName = this.resolveName(this.sectorNames[targetSectorMacro] || '');
                o.target_sector_macro = targetSectorMacro;
                o.target_sector_name = targetSectorName;
            }
        }
    }

    async parse(file, onProgress) {
        this.onProgress = onProgress;
        
        if (onProgress) onProgress('Reading...');
        
        let xmlText;
        
        // Check if it's actually gzipped
        const header = await this.readFileHeader(file);
        const isGzipped = header[0] === 0x1f && header[1] === 0x8b;
        
        if (isGzipped) {
            try {
                xmlText = await this.decompressNative(file, onProgress);
            } catch (e) {
                throw new Error('Failed to decompress file. Browser may not support gzip decompression: ' + e.message);
            }
        } else {
            xmlText = await file.text();
        }
        
        if (onProgress) onProgress('Parsing...');
        
        await this.parseXML(xmlText, onProgress);
        
        if (onProgress) onProgress('Finishing...');
        this.writeGateTargetSectors();
        
        return this.data;
    }

    async readFileHeader(file) {
        const slice = file.slice(0, 2);
        const buffer = await slice.arrayBuffer();
        return new Uint8Array(buffer);
    }

    async decompressNative(file, onProgress) {
        const ds = new DecompressionStream('gzip');
        const decompressedStream = file.stream().pipeThrough(ds);
        const reader = decompressedStream.getReader();
        const chunks = [];
        let totalSize = 0;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            totalSize += value.length;
            if (onProgress && totalSize % (5 * 1024 * 1024) < value.length) {
                onProgress(`Reading ${Math.round(totalSize / 1024 / 1024)} MB`);
            }
        }
        
        const result = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        
        return new TextDecoder().decode(result);
    }

    async parseXML(xmlText, onProgress) {
        const path = [];
        const len = xmlText.length;
        let lastProgress = -1;
        
        const tagPattern = /<(\/?)([\w:-]+)([^>]*?)(\/?)>/g;
        
        let match;
        let matchCount = 0;
        
        while ((match = tagPattern.exec(xmlText)) !== null) {
            const [fullMatch, closeSlash, tagName, attrString, selfClose] = match;
            matchCount++;
            
            // Skip XML declarations, comments, CDATA, DOCTYPE
            if (tagName.startsWith('?') || tagName.startsWith('!')) {
                continue;
            }
            
            if (closeSlash === '/') {
                // Closing tag
                if (path.length > 0) {
                    this.maybeStoreSuperHighwayStep(path);
                    this.maybeStorePosition(path);
                    this.maybeStoreResourceEnd(path);
                    path.pop();
                }
            } else {
                // Opening tag
                const attrib = this.parseAttributes(attrString);
                const element = { tag: tagName, attrib };
                path.push(element);
                
                this.maybeStoreComponentPosition(path);
                this.maybeStoreObject(path);
                this.maybeStoreResourceStart(path);
                
                if (selfClose === '/') {
                    // Self-closing tag, immediately close
                    this.maybeStoreSuperHighwayStep(path);
                    this.maybeStorePosition(path);
                    this.maybeStoreResourceEnd(path);
                    path.pop();
                }
            }
            
            // Progress reporting - update every 1% and yield to UI
            if (onProgress) {
                const progress = Math.floor(match.index / len * 100);
                if (progress > lastProgress) {
                    lastProgress = progress;
                    onProgress(`Parsing... ${progress}%`);
                    // Yield to UI every percent to keep it responsive
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        }
    }

    parseAttributes(attrString) {
        const attrib = {};
        const attrPattern = /([\w-]+)="([^"]*)"/g;
        let match;
        while ((match = attrPattern.exec(attrString)) !== null) {
            attrib[match[1]] = match[2];
        }
        return attrib;
    }
}

// Load configuration files and set up the parser
async function loadConfig() {
    const basePath = window.location.pathname.replace(/\/[^\/]*$/, '') || '.';
    
    const fetchJson = async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load ${url}: ${response.status}`);
        }
        return response.json();
    };
    
    const [sectorNames, shipNames, positions, strings] = await Promise.all([
        fetchJson(`${basePath}/assets/x4-sector-names.json`),
        fetchJson(`${basePath}/assets/x4-ship-names.json`),
        fetchJson(`${basePath}/assets/x4-positions.json`),
        fetchJson(`${basePath}/assets/x4-strings.json`)
    ]);
    
    return { sectorNames, shipNames, positions, strings };
}

// Main upload handler
async function handleFileUpload(file) {
    const progressEl = document.getElementById('upload-progress');
    const statusEl = document.getElementById('upload-status');
    statusEl.style.color = '#aaa';
    
    try {
        progressEl.style.display = 'block';
        statusEl.textContent = 'Loading configuration...';
        
        const config = await loadConfig();
        
        const parser = new X4SaveParser(
            config.sectorNames,
            config.shipNames,
            config.positions,
            config.strings
        );
        
        const newData = await parser.parse(file, (status) => {
            statusEl.textContent = status;
        });
        
        const sectorCount = Object.keys(newData.sectors).length;
        
        if (sectorCount === 0) {
            statusEl.textContent = 'Warning: No sectors found in save file';
            statusEl.style.color = 'orange';
            return;
        }
        
        // Update global data and refresh UI
        window.data = newData;
        updateSidebar();
        
        // Show the filter input
        const filterInput = document.getElementById('sector-filter');
        if (filterInput) {
            filterInput.style.display = 'block';
        }
        
        progressEl.style.display = 'none';
        
    } catch (error) {
        console.error('Error parsing save file:', error);
        statusEl.textContent = 'Error: ' + error.message;
        statusEl.style.color = 'crimson';
    }
}

function updateSidebar() {
    const sidebar = document.getElementById('sidebar');
    
    // Remove existing sector links (keep title and upload button)
    const existingSectors = sidebar.querySelectorAll('.sector');
    existingSectors.forEach(el => el.remove());
    
    // Clear the filter
    const filterInput = document.getElementById('sector-filter');
    if (filterInput) {
        filterInput.value = '';
    }
    
    // Clear the plot
    const plotDiv = document.getElementById('plot');
    plotDiv.innerHTML = 'Please select a sector from the list';
    
    // Sort sectors by name
    const sectorNames = Object.keys(window.data.sectors)
        .map(k => ({ name: window.data.sectors[k].name, id: k }))
        .sort((a, b) => a.name.localeCompare(b.name));
    
    // Add sector links
    for (const { id: sectorId, name: sectorName } of sectorNames) {
        const sectorData = window.data.sectors[sectorId];
        const tags = [
            maybe_loot_tag(sectorData),
            maybe_ship_tag(sectorData),
            maybe_khaak_tag(sectorData),
            maybe_headquarter_tag(sectorData),
            maybe_unexplored_tag(sectorData)
        ].join('');
        
        // Create searchable text from name and tag contents
        const searchText = (sectorName + ' ' + tags.replace(/<[^>]*>/g, ' ')).toLowerCase();
        
        const html = `
        <a class="sector" id="${sectorId}" onclick="show('${sectorId}')" data-search="${searchText}">
        ${sectorName}
        ${tags}
        </a>
        `;
        sidebar.insertAdjacentHTML('beforeend', html);
    }
}

function filterSectors(query) {
    const normalizedQuery = query.toLowerCase().trim();
    const sectors = document.querySelectorAll('.sector');
    
    sectors.forEach(sector => {
        const searchText = sector.getAttribute('data-search') || '';
        if (normalizedQuery === '' || searchText.includes(normalizedQuery)) {
            sector.classList.remove('hidden');
        } else {
            sector.classList.add('hidden');
        }
    });
}
