/**
* Location object definition
* @param {Object} data - location data
*/
var Location = function(data) {
    this.id = data.id;
    this.areaname = data.name;
    this.safetylevel = data.safelevel;
    this.crimecount = data.count;
    this.lat = data.lat;
    this.lng = data.lng;
};

// Knockout JS custom handler definition
ko.bindingHandlers.anothermap = {
    // init function of this custom binding
    init: function (element, valueAccessor, allBindings, viewModel) {
        // values come from html data-binding
        var value = valueAccessor();
        var areaname = value.areaname;
        var lat = value.centerLat;
        var lng = value.centerLng;
        var mapObj = ko.unwrap(value.mapState);
        // Set initial center position
        mapObj.initialLoc(new Location({"areaname": areaname, "lat": lat, "lng": lng}));
        // Load all area name data
        areanameData(mapObj);
    },
    // update function of this custom binding
    update: function (element, valueAccessor, allBindings, viewModel) {
        var value = valueAccessor();
        var mapObj = ko.unwrap(value.mapState);
        var latLng = new google.maps.LatLng(mapObj.initialLoc().lat,
                                            mapObj.initialLoc().lng);
        var mapOptions = { center: latLng,
                           zoom: 11,
                           mapTypeId: google.maps.MapTypeId.ROADMAP};
        // Render a map
        mapObj.googleMap = new google.maps.Map(element, mapOptions);

        // Render location markers
        mapObj.onAreanameLoad = function(data) {
            mapObj.locations().forEach(function(loc) {
                var marker = new google.maps.Marker({
                    map: mapObj.googleMap,
                    position: new google.maps.LatLng(loc.lat,
                                                     loc.lng),
                    icon: "/static/image/red-marker.png",
                    animation: google.maps.Animation.DROP,
                    info: new google.maps.InfoWindow({
                        content: locationContent(loc)
                    }),
                    safetylevel: loc.safetylevel
                });
                // Event listeners for mouseover and mouseout
                marker.addListener("mouseover", function() {
                    this.setIcon("/static/image/green-marker.png");
                    this.info.open(mapObj.googleMap, this);
                });
                marker.addListener("mouseout", function() {
                    this.setIcon("/static/image/red-marker.png");
                    this.info.close();
                });

                // Load crime data when a location marker is clicked,
                // When crime markers appears, it zooms to current center
                marker.addListener("click", function() {
                    marker.setAnimation(google.maps.Animation.BOUNCE);
                    updateData(mapObj, marker);
                });
                // Add listener function when infowindow is closed.
                marker.info.addListener("closeclick", function() {
                    marker.setIcon("/static/image/red-marker.png");
                });
                // Save a marker
                mapObj.locMarkers().push(marker);
            });
        };
        // Watches location data loading completion
        mapObj.locationLoaded.subscribe(mapObj.onAreanameLoad);

        // Deselect old location marker when another location is clicked
        mapObj.onCurrentChange = function(data) {
            var previous = mapObj.previousMarker();
            if (previous) {
                previous.info.close();
                previous.setIcon("/static/image/red-marker.png");
            }
            var marker = mapObj.currentMarker();
            marker.info.open(mapObj.googleMap, marker);
            marker.setIcon("/static/image/green-marker.png");
        };

        // Watches a currentMarker state change
        mapObj.currentMarker.subscribe(mapObj.onCurrentChange);

        // Load crime data and renders markers without zoom
        mapObj.onCurrentActivate = function(data) {
            var marker = mapObj.currentMarker();
            marker.setAnimation(google.maps.Animation.BOUNCE);
            updateData(mapObj, marker);
        };
        // Watches a crimeDataRequested state change
        mapObj.dataRequested.subscribe(mapObj.onCurrentActivate);

        // Re-render crime markers looking at a current category state
        mapObj.onChangedCrimeFilter = function(data) {
            filterCrimeMarkers(mapObj);
        };

        // Watches a category(filter) state change
        mapObj.category.subscribe(mapObj.onChangedCrimeFilter);

        // Show only requested location names and markers
        mapObj.onChangedSafetyLevel = function(data) {
            filterLocations(mapObj);
        };

        // Watches a safetyLevel state change
        mapObj.safetyLevel.subscribe(mapObj.onChangedSafetyLevel);
    }
};


// Load location data
var areanameData = function(mapObj) {
    url = "/api/location/JSON?";
    $.getJSON(url, function(data) {
        $.each(data, function(i, entry) {
            var loc = new Location(entry);
            mapObj.locations().push(loc);
        });
        mapObj.locationLoaded(true);
    })
        .fail(function(jqxhr, textStatus, error) {
            mapObj.errorMessage("Failed to get area info from server");
            mapObj.showErrorMessage(true);
        });
};

// Create location infowindow content
var locationContent = function(loc) {
    content = "";
    content += '<div class="area-info-window">Area Name: <b>';
    content += loc.areaname + "</b><br/>";
    content += "Number of Crimes: " + loc.crimecount + "<br/>";
    return content;
};

// Delete all crime markers
var clearCrimeMarkers = function(mapObj) {
    // Clear all markers currently shown
    while(mapObj.crimeMarkers().length > 0) {
        var m = mapObj.crimeMarkers().shift();
        m.setMap(null);
    }
};

// Filter crime markers
var filterCrimeMarkers = function(mapObj) {
    var filter = mapObj.category();
    if ("clear" == filter) {
        clearCrimeMarkers(mapObj);
        mapObj.category("all");
        mapObj.showCrimeFilter(false);
        mapObj.crimeFilterButton(false);
    } else {
        var markers = mapObj.crimeMarkers();
        for(var i=0; i<markers.length; i++) {
            var m = markers[i];
            if ("all" == filter || m.category == filter) {
                m.setVisible(true);
            } else {
                m.setVisible(false);
            }
        }
    }
};

// Filter location markers
var filterLocations = function(mapObj) {
    var markers = mapObj.locMarkers();
    var level = mapObj.safetyLevel();
    for(var i=0; i<markers.length; i++) {
        var marker = markers[i];
        if (0 == level || marker.safetylevel == level) {
            marker.setVisible(true);
        } else {
            marker.setVisible(false);
        }
    }
};

// Checks whether the crime marker should be visible or not
var isVisible = function(mapObj, entry) {
    if ("all" == mapObj.category()) {
        return true;
    } else if (mapObj.category() == entry.category) {
        return true;
    } else {
        return false;
    }
};

// Load crime data
var updateData = function(mapObj, marker) {
    // Clear crime markers in an old location
    clearCrimeMarkers(mapObj);
    var lat = marker.position.lat();
    var lng = marker.position.lng();
    // Make a request to API endpoint
    url = "/api/JSON?lat=" + lat + "&lng=" + lng;
    $.getJSON(url, function(data) {
        $.each(data, function(i, entry) {
            if (entry.position) {
                // Create each marker
                var crimeMarker = new google.maps.Marker({
                    map: mapObj.googleMap,
                    position: new google.maps.LatLng(entry.position.lat,
                                                     entry.position.lng),
                    visible: isVisible(mapObj, entry),
                    category: entry.category,
                    title: entry.title,
                    icon: entry.icon
                });
                // Create an infowindow of this marker
                var infoObj = new google.maps.InfoWindow({
                    content: '<div class="crime-info-window">' + entry.content + "</div>"
                });

                // Add lister function when infowindow is opened.
                crimeMarker.addListener("click", function() {
                    infoObj.open(mapObj.googleMap, crimeMarker);
                    crimeMarker.setAnimation(google.maps.Animation.BOUNCE);
                });
                // Add listener function when infowindow is closed.
                infoObj.addListener("closeclick", function() {
                    crimeMarker.setAnimation(null);
                });
                // Save a marker
                mapObj.crimeMarkers().push(crimeMarker);
            }
        });
        marker.setAnimation(null);
        mapObj.googleMap.setCenter(marker.position);
        mapObj.googleMap.setZoom(16);
        mapObj.crimeFilterButton(true);
    })
        .fail(function(jqxhr, textStatus, error) {
            mapObj.errorMessage("Failed to get crime data from server");
            mapObj.showErrorMessage(true);
        });
};


/**
* @description View model definition
*/
var mapModel = function() {
    var self = this;
    self.mapState = ko.observable({
        // location (area) data
        locations: ko.observableArray([]),
        // flag to signal location data loading completion
        locationLoaded: ko.observable(false),
        // initial center location
        initialLoc: ko.observable(),
        // all location markers
        locMarkers: ko.observableArray([]),
        // safety level of locations, 1-3
        safetyLevel: ko.observable(0),
        // flag to show/hide safety level menu
        showSafetyLevel: ko.observable(true),
        // previous location marker
        previousMarker: ko.observable(),
        // current location marker
        currentMarker: ko.observable(),
        // all crime markers of the current location
        crimeMarkers: ko.observableArray([]),
        // flag to signal marker data loading request
        dataRequested: ko.observable(false),
        // flag to signal Crime Filter button to toggle show/hide
        crimeFilterButton: ko.observable(false),
        // flag to show/hide safety level menu
        showCrimeFilter: ko.observable(true),
        // current category (filter)
        category: ko.observable("all"),
        // error message
        errorMessage: ko.observable(""),
        // show/hide error message HTML block
        showErrorMessage: ko.observable(false)
    });

    // Change the current location
    this.setCurrent = function(index, lat, lng) {
        self.mapState().previousMarker(self.mapState().currentMarker());
        self.mapState().currentMarker(self.mapState().locMarkers()[parseInt(index)-1]);
    };

    // Change the current location and load crime data
    this.activateCurrent = function(index, lat, lng) {
        self.setCurrent(index, lat, lng);
        var current = self.mapState().dataRequested();
        if (current) {
            self.mapState().dataRequested(false);
        } else {
            self.mapState().dataRequested(true);
        }
    };

    // Return truthy value whether a location should be visible or not
    this.shouldShowLocation = function(index) {
        var current = self.mapState().safetyLevel();
        if (0 == current) {
            return true;
        } else {
            var safety = self.mapState().locMarkers()[parseInt(index)-1].safetylevel;
            return current == safety;
        }
    };

    // Toggle the current state of showSafetyLevel
    this.toggleShowSafetyLevel = function() {
        var current = self.mapState().showSafetyLevel();
        self.mapState().showSafetyLevel(!current);
    };

    // Return the current safety level
    this.shouldShowSafetyLevel = function() {
        return self.mapState().showSafetyLevel();
    };

    // Change the current safety level
    this.setSafetyLevel = function(data) {
        self.mapState().safetyLevel(data);
    };

    // Change the current category (filter)
    this.setCategory = function(data) {
        self.mapState().category(data);
    };

    // Toggle show/hide crime filters
    this.toggleShowCrimeFilter = function() {
        var current = self.mapState().showCrimeFilter();
        self.mapState().showCrimeFilter(!current);
    };

    // Return the value of showCrimeFilter to show/hide Crime Filter Button
    this.shouldShowCrimeFilter = function() {
        return self.mapState().showCrimeFilter();
    };

    // Return the state of Crime Filter button
    this.getCrimeFilterButton = function() {
        return self.mapState().crimeFilterButton();
    };

    // Return error message
    this.getErrorMessage = function() {
        return self.mapState().errorMessage();
    };

    // Return showErrorMessage state
    this.shouldShowErrorMessage = function() {
        return self.mapState().showErrorMessage();
    };

    // Change showErrorMessage state to false
    this.dismissErrorMessage = function() {
        self.mapState().showErrorMessage(false);
    };

};

// Error handling function
function googleMapError() {
    alert("Failed to start app. Check Internet connection, URL, etc. Then, reload.");
}

// Callback function when Google Map is loaded
var initMap = function() {
    ko.applyBindings(new mapModel());
};
