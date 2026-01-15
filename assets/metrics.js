(function() {
    var siteId = '1';
    var trackerUrl = 'https://metrics.flechtmann.net/m.php';
    
    var factionDimensions = {
        'antigone': 8, 'argon': 9, 'buccaneers': 10, 'fallenfamilies': 11,
        'freefamilies': 12, 'godrealm': 13, 'hatikvah': 14, 'holyorder': 15,
        'khaak': 16, 'ministry': 17, 'paranid': 18, 'player': 19,
        'scaleplate': 20, 'pioneers': 21, 'split': 22, 'teladi': 23,
        'terran': 24, 'trinity': 25, 'vigor': 26, 'xenon': 27, 'zyarth': 28
    };
    
    function getBaseParams() {
        return {
            idsite: siteId,
            rec: 1,
            url: window.location.href,
            urlref: document.referrer,
            res: window.screen.width + 'x' + window.screen.height,
            rand: Math.random().toString(36).substring(2)
        };
    }
    
    function track(params) {
        var baseParams = getBaseParams();
        var allParams = Object.assign({}, baseParams, params);
        var queryString = Object.keys(allParams)
            .map(function(key) { return key + '=' + encodeURIComponent(allParams[key]); })
            .join('&');
        
        var img = new Image();
        img.src = trackerUrl + '?' + queryString;
    }
    
    track({ action_name: document.title });
    
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
    
    window.trackSectorView = function(sectorName, source) {
        track({
            e_c: 'Sector',
            e_a: source === 'gate' ? 'Opened via Gate' : 'Opened via Sidebar',
            e_n: sectorName
        });
    };
    
    window.trackSaveFileStats = function(success, processingTimeMs, fileSizeBytes, stats) {
        var fileSizeMB = Math.round(fileSizeBytes / (1024 * 1024));
        var processingTimeRounded = Math.round(processingTimeMs);
        
        var eventData = {
            e_c: 'Save File',
            e_a: 'Save Processed',
            e_n: success ? 'Success' : 'Failed',
            e_v: processingTimeRounded,
            dimension1: success ? 'Success' : 'Failed',
            dimension2: fileSizeMB,
            dimension3: processingTimeRounded,
            dimension4: stats ? (stats.vaults.empty || 0) : 0,
            dimension5: stats ? (stats.vaults.with_blueprints || 0) : 0,
            dimension6: stats ? (stats.vaults.with_signalleaks || 0) : 0,
            dimension7: stats ? (stats.vaults.with_wares || 0) : 0
        };
        
        if (stats && stats.stations_by_faction) {
            for (var faction in stats.stations_by_faction) {
                var dimId = factionDimensions[faction.toLowerCase()];
                if (dimId) {
                    eventData['dimension' + dimId] = stats.stations_by_faction[faction];
                }
            }
        }
        
        track(eventData);
    };
})();
