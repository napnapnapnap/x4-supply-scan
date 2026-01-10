// X4 Save File Parser - Main thread interface

// Initialize empty data structure
window.data = { sectors: {} };

// Load configuration files
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
        
        // Create worker
        const basePath = window.location.pathname.replace(/\/[^\/]*$/, '') || '.';
        const worker = new Worker(`${basePath}/assets/parser-worker.js`);
        
        // Handle worker messages
        worker.onmessage = function(e) {
            const { type, status, data, message } = e.data;
            
            if (type === 'progress') {
                statusEl.textContent = status;
            } else if (type === 'complete') {
                const sectorCount = Object.keys(data.sectors).length;
                
                if (sectorCount === 0) {
                    statusEl.textContent = 'Warning: No sectors found in save file';
                    statusEl.style.color = 'orange';
                    worker.terminate();
                    return;
                }
                
                // Update global data and refresh UI
                window.data = data;
                updateSidebar();
                
                // Show the filter input
                const filterInput = document.getElementById('sector-filter');
                if (filterInput) {
                    filterInput.style.display = 'block';
                }
                
                progressEl.style.display = 'none';
                worker.terminate();
            } else if (type === 'error') {
                console.error('Worker error:', message);
                statusEl.textContent = 'Error: ' + message;
                statusEl.style.color = 'crimson';
                worker.terminate();
            }
        };
        
        worker.onerror = function(error) {
            console.error('Worker error:', error);
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.style.color = 'crimson';
            worker.terminate();
        };
        
        // Start parsing
        worker.postMessage({ type: 'parse', file, config });
        
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
