// X4 Save File Parser - Web Worker

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
        
        // Pre-compiled regexes (avoids repeated allocations)
        this.REFERENCE = /\{(\d*),\s*(\d+)\}/g;
        this.PARENTHESES = /^(.*)\([^)]*\)(.*)$/;
        this.ATTR_PATTERN = /([\w-]+)="([^"]*)"/g;
    }

    resolveName(s) {
        const seen = new Set();
        while (true) {
            this.REFERENCE.lastIndex = 0;
            const matchObj = this.REFERENCE.exec(s);
            if (matchObj === null) break;
            
            const left = s.substring(0, matchObj.index);
            const right = s.substring(matchObj.index + matchObj[0].length);
            const first = matchObj[1] || '20';  // Default page ID for X4 strings
            const second = matchObj[2];
            const tag = `${first},${second}`;
            
            let replacement = '';
            if (!seen.has(tag)) {
                seen.add(tag);
                replacement = this.strings[first]?.[second] || '';
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

    getSectorName(sectorMacro) {
        const rawName = this.sectorNames[sectorMacro] || sectorMacro;
        return this.resolveName(rawName);
    }

    // Check if path ends with specific tag sequence (more efficient than string splitting)
    isAtTags(path, ...tags) {
        const n = tags.length;
        if (path.length < n) return false;
        for (let i = 0; i < n; i++) {
            if (path[path.length - n + i].tag !== tags[i]) return false;
        }
        return true;
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
        if (this.isAtTags(path, 'component', 'offset', 'position')) {
            const last = path[path.length - 1];
            const x = parseFloat(last.attrib['x'] || '0');
            const y = parseFloat(last.attrib['y'] || '0');
            const z = parseFloat(last.attrib['z'] || '0');
            const code = path[path.length - 3].attrib['code'];
            this.componentPositions[code] = [x, y, z];
        }
    }

    maybeStoreObject(path) {
        const last = path[path.length - 1];
        const attrib = last.attrib;
        
        if (this.isSector(path)) {
            this.currentSector = attrib['macro'];
            this.data.sectors[this.currentSector] = {
                name: this.getSectorName(this.currentSector),
                is_known: attrib['known'] === '1' || attrib['knownto'] === 'player',
                objects: {},
                resource_areas: []
            };
            return;
        }
        
        // Cache condition results to avoid repeated checks
        const isStation = this.isStation(path);
        const isSectorGate = this.isSectorGate(path);
        const isSuperHighwayGate = this.isSuperHighwayGate(path);
        const isVault = this.isVault(path);
        const isAbandonedShip = this.isAbandonedShip(path);
        
        if (isStation || isSectorGate || isSuperHighwayGate || isVault || isAbandonedShip) {
            const code = attrib['code'];
            let macro;
            
            if (isSectorGate) {
                macro = (path[path.length - 2].attrib['connection'] || '').toLowerCase();
            } else if (isAbandonedShip) {
                macro = this.getShipName(attrib['macro'] || '');
            } else {
                macro = attrib['macro'] || '';
            }
            
            if (!this.data.sectors[this.currentSector]) return;
            
            const obj = {
                class: attrib['class'] || '',
                code: code,
                macro: macro,
                owner: attrib['owner'] || ''
            };
            
            if (isStation && attrib['state'] === 'wreck') {
                obj.is_wreck = true;
            }
            if (isVault) {
                obj.has_blueprints = false;
                obj.has_signalleak = false;
                obj.has_wares = false;
            }
            if (isSectorGate || isSuperHighwayGate) {
                obj.is_active = true;
            }
            if (isStation && attrib['factionheadquarters'] === '1') {
                obj.is_headquarter = true;
            }
            
            this.data.sectors[this.currentSector].objects[code] = obj;
            
            // Store type flags for position calculation
            last._isStation = isStation;
            last._isSectorGate = isSectorGate;
            last._isSuperHighwayGate = isSuperHighwayGate;
            last._isVault = isVault;
            last._isAbandonedShip = isAbandonedShip;
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
        const last = path[path.length - 1];
        // Use cached flags from maybeStoreObject instead of recalculating
        if (!(last._isStation || last._isSectorGate || last._isSuperHighwayGate || last._isVault || last._isAbandonedShip)) {
            return;
        }
        
        let x = 0, y = 0, z = 0;
        
        // Single pass through path for both component and connection offsets
        for (const elem of path) {
            if (elem.tag === 'component') {
                const code = elem.attrib['code'];
                const p = this.componentPositions[code];
                if (p) {
                    x += p[0];
                    y += p[1];
                    z += p[2];
                }
                
                const macro = elem.attrib['macro'];
                const offset = macro && this.positions[macro];
                if (offset) {
                    x += offset.x;
                    y += offset.y;
                    z += offset.z;
                }
            } else if (elem.tag === 'connection') {
                const gateId = elem.attrib['connection'];
                if (gateId?.startsWith('connection_clustergate')) {
                    const offset = this.positions[gateId];
                    if (offset) {
                        x += offset.x;
                        y += offset.y;
                        z += offset.z;
                    }
                }
            }
        }
        
        const obj = this.data.sectors[this.currentSector]?.objects[last.attrib['code']];
        if (obj) {
            obj.x = x;
            obj.y = y;
            obj.z = z;
        }
    }

    maybeStoreResourceStart(path) {
        if (this.isAtTags(path, 'resourceareas', 'area')) {
            const last = path[path.length - 1];
            this.currentResourceArea = {
                x: parseInt(last.attrib['x'] || '0'),
                y: parseInt(last.attrib['y'] || '0'),
                z: parseInt(last.attrib['z'] || '0'),
                resources: {}
            };
        } else if (this.currentResourceArea) {
            // Only check these if we're inside a resource area
            if (this.isAtTags(path, 'resourceareas', 'area', 'wares', 'ware', 'recharge')) {
                const resourceName = path[path.length - 2].attrib['ware'];
                if (!this.currentResourceArea.resources[resourceName]) {
                    this.currentResourceArea.resources[resourceName] = {};
                }
                const last = path[path.length - 1];
                const rechargeMax = parseInt(last.attrib['max'] || '0');
                const rechargeCurrent = last.attrib['current'];
                
                this.currentResourceArea.resources[resourceName].recharge_max = rechargeMax;
                this.currentResourceArea.resources[resourceName].recharge_current = 
                    rechargeCurrent === undefined ? rechargeMax : parseInt(rechargeCurrent);
                this.currentResourceArea.resources[resourceName].recharge_time = parseInt(last.attrib['time'] || '0');
            } else if (this.isAtTags(path, 'resourceareas', 'area', 'yields', 'ware', 'yield')) {
                const resourceName = path[path.length - 2].attrib['ware'];
                if (!this.currentResourceArea.resources[resourceName]) {
                    this.currentResourceArea.resources[resourceName] = {};
                }
                this.currentResourceArea.resources[resourceName].yield = 
                    path[path.length - 1].attrib['name'] || '';
            }
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

    parseXML(xmlText, onProgress) {
        const path = [];
        const len = xmlText.length;
        let lastProgress = -1;
        let tagCount = 0;
        
        const tagPattern = /<(\/?)([\w:-]+)([^>]*?)(\/?)>/g;
        
        let match;
        
        while ((match = tagPattern.exec(xmlText)) !== null) {
            const [, closeSlash, tagName, attrString, selfClose] = match;
            
            // Skip XML declarations, comments, CDATA, DOCTYPE
            if (tagName.charCodeAt(0) === 63 || tagName.charCodeAt(0) === 33) { // '?' or '!'
                continue;
            }
            
            if (closeSlash) {
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
                
                if (selfClose) {
                    // Self-closing tag, immediately close
                    this.maybeStoreSuperHighwayStep(path);
                    this.maybeStorePosition(path);
                    this.maybeStoreResourceEnd(path);
                    path.pop();
                }
            }
            
            // Progress reporting (check every 10000 tags to reduce overhead)
            if (++tagCount % 10000 === 0) {
                const progress = Math.floor(match.index / len * 100);
                if (progress > lastProgress) {
                    lastProgress = progress;
                    onProgress(progress);
                }
            }
        }
    }

    parseAttributes(attrString) {
        const attrib = {};
        this.ATTR_PATTERN.lastIndex = 0;
        let match;
        while ((match = this.ATTR_PATTERN.exec(attrString)) !== null) {
            attrib[match[1]] = match[2];
        }
        return attrib;
    }
}

// Worker message handler
self.onmessage = async function(e) {
    const { type, file, config } = e.data;
    
    if (type === 'parse') {
        try {
            // Read and decompress file
            self.postMessage({ type: 'progress', status: 'Reading...' });
            
            let xmlText;
            const arrayBuffer = await file.arrayBuffer();
            const header = new Uint8Array(arrayBuffer.slice(0, 2));
            const isGzipped = header[0] === 0x1f && header[1] === 0x8b;
            
            if (isGzipped) {
                const ds = new DecompressionStream('gzip');
                const blob = new Blob([arrayBuffer]);
                const decompressedStream = blob.stream().pipeThrough(ds);
                const reader = decompressedStream.getReader();
                const chunks = [];
                let totalSize = 0;
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    totalSize += value.length;
                    if (totalSize % (5 * 1024 * 1024) < value.length) {
                        self.postMessage({ type: 'progress', status: `Reading ${Math.round(totalSize / 1024 / 1024)} MB` });
                    }
                }
                
                const result = new Uint8Array(totalSize);
                let offset = 0;
                for (const chunk of chunks) {
                    result.set(chunk, offset);
                    offset += chunk.length;
                }
                
                xmlText = new TextDecoder().decode(result);
            } else {
                xmlText = new TextDecoder().decode(arrayBuffer);
            }
            
            // Parse XML
            self.postMessage({ type: 'progress', status: 'Parsing...' });
            
            const parser = new X4SaveParser(
                config.sectorNames,
                config.shipNames,
                config.positions,
                config.strings
            );
            
            let lastReportedProgress = -1;
            parser.parseXML(xmlText, (progress) => {
                // Only report every 5% to reduce message overhead
                if (progress >= lastReportedProgress + 5) {
                    lastReportedProgress = progress;
                    self.postMessage({ type: 'progress', status: `Parsing... ${progress}%` });
                }
            });
            
            // Post-processing
            self.postMessage({ type: 'progress', status: 'Finishing...' });
            parser.writeGateTargetSectors();
            
            // Send result
            self.postMessage({ type: 'complete', data: parser.data });
            
        } catch (error) {
            self.postMessage({ type: 'error', message: error.message });
        }
    }
};

