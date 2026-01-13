// Metrics - using HTTP Tracking API (no external script needed)
(function() {
    var siteId = '1';
    var trackerUrl = 'https://metrics.flechtmann.net/m.php';
    
    // Build base tracking parameters
    function getBaseParams() {
        return {
            idsite: siteId,
            rec: 1,
            url: window.location.href,
            urlref: document.referrer,
            res: window.screen.width + 'x' + window.screen.height,
            rand: Math.random().toString(36).substring(2),
            _cvar: JSON.stringify({ '1': ['Source', 'Web'] })
        };
    }
    
    // Send tracking request via image beacon
    function track(params) {
        var baseParams = getBaseParams();
        var allParams = Object.assign({}, baseParams, params);
        var queryString = Object.keys(allParams)
            .map(function(key) { return key + '=' + encodeURIComponent(allParams[key]); })
            .join('&');
        
        var img = new Image();
        img.src = trackerUrl + '?' + queryString;
    }
    
    // Track page view
    track({ action_name: document.title });
    
    // Track "Select Save" button clicks
    document.addEventListener('DOMContentLoaded', function() {
        var uploadButton = document.querySelector('.upload-button');
        if (uploadButton) {
            uploadButton.addEventListener('click', function() {
                track({
                    e_c: 'Save File',
                    e_a: 'Select Save Clicked'
                });
            });
        }
    });
    
    // Track sector view (called from script.js)
    window.trackSectorView = function(sectorName) {
        track({
            e_c: 'Sector',
            e_a: 'Sector Opened',
            e_n: sectorName
        });
    };
    
    // Track save file processing stats (called from parser.js)
    window.trackSaveFileStats = function(success, processingTimeMs, fileSizeBytes, stats) {
        var fileSizeMB = Math.round(fileSizeBytes / (1024 * 1024));
        
        // Track processing result with file size
        track({
            e_c: 'Save File',
            e_a: success ? 'Processing Success' : 'Processing Failed',
            e_n: 'File Size (MB)',
            e_v: fileSizeMB
        });
        
        // Track processing time
        track({
            e_c: 'Save File',
            e_a: 'Processing Time',
            e_v: Math.round(processingTimeMs)
        });
        
        // Track detailed stats only on success
        if (success && stats) {
            // Vault counts
            track({
                e_c: 'Vaults',
                e_a: 'Empty Vault Count',
                e_v: stats.vaults.empty
            });
            track({
                e_c: 'Vaults',
                e_a: 'Vault with Blueprints Count',
                e_v: stats.vaults.with_blueprints
            });
            track({
                e_c: 'Vaults',
                e_a: 'Vault with Wares Count',
                e_v: stats.vaults.with_wares
            });
            track({
                e_c: 'Vaults',
                e_a: 'Vault with Signal Leaks Count',
                e_v: stats.vaults.with_signalleaks
            });
            
            // Station counts by faction
            for (var faction in stats.stations_by_faction) {
                track({
                    e_c: 'Stations',
                    e_a: faction + ' Station Count',
                    e_v: stats.stations_by_faction[faction]
                });
            }
        }
    };
})();
