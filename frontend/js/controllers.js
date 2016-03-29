"use strict";

const app = angular.module("ngSkateApp", ["getJson", "ngMap", "mapService", "cloudinaryUploadService", "localStorageService", "cloudinary", "ngFileUpload"]);

// Controller for getting data from server and presenting to view
app.controller("ListCtrl", ($scope, $http, $rootScope, getJson) => {

	// Initialise array to store databases response
	$scope.allData = [];

	// This is fired on page init to get ALL the skateparks
	getJson.success((response) => {

		// Store the response in the array
		$scope.allData = response;

		console.log($scope.allData);

	}).then((response) => {

			// Tell the map controller to do its thing
			$rootScope.$broadcast("runMapCtrl");

			// Tell the vote controller to do its thing
			$rootScope.$broadcast("runVoteCtrl");

		});

	// A fake skatepark
	$scope.fake = [{skateparkLocation: [0, 0]}];

	// Helper function to reverse contents of array
	$scope.rev = (array) => {
		let copy = [].concat(array);
		return copy.reverse();
	};

});

// Controller to handle ratings / upvotes
app.controller("RatingCtrl", ($scope, $rootScope, $http, localStorageService) => {

	// A button in the view fires this method
	// It's bound to the scope, so automagically updates
	$scope.incrementRating = (item) => {

		// Update the local scope
		item.skateparkRating += 1;

		// Send put request to server
		$http.put("/skateparks/" + item._id, item).success((response) => { 

			// Once success has been reached, add a reference within localStorage so that this particular skatepark can't get upvoted by this device.
			// note: can work around this by clearing browser cache / different browser but sufficient for this example - look into this as part of ongoing maintanence

			// init new localstorage
			if (!localStorageService.get("spUsrHasAdded")) localStorageService.set("spUsrHasAdded", [response]);
			else
			{
				// append to existing
				let currents = localStorageService.get("spUsrHasAdded");
					currents.push(response);

					localStorageService.set("spUsrHasAdded", currents);

				// Tell the vote controller to do its thing
				$rootScope.$broadcast("runVoteCtrl");

			}

		});

	};

});

// Controller to handle searching
app.controller("SearchCtrl", ($scope, $http, $rootScope, NgMap) => {

    $scope.$watch('searchString', function(newValue, oldValue) {

    	let payload = null;

    	if (newValue) payload = newValue;

    	$rootScope.$broadcast("filterMarkers", newValue);

    });

});

// Controller for Google maps presentation, marker and infoWindow logic
app.controller("MapCtrl", ($scope, $http, $rootScope, NgMap, mapService, Upload) => {

	// Namespace
	const inst = this;

	// Apply some custom css
	$scope.styles = [{"featureType":"water","elementType":"all","stylers":[{"hue":"#76aee3"},{"saturation":38},{"lightness":-11},{"visibility":"on"}]},{"featureType":"road.highway","elementType":"all","stylers":[{"hue":"#8dc749"},{"saturation":-47},{"lightness":-17},{"visibility":"on"}]},{"featureType":"poi.park","elementType":"all","stylers":[{"hue":"#c6e3a4"},{"saturation":17},{"lightness":-2},{"visibility":"on"}]},{"featureType":"road.arterial","elementType":"all","stylers":[{"hue":"#cccccc"},{"saturation":-100},{"lightness":13},{"visibility":"on"}]},{"featureType":"administrative.land_parcel","elementType":"all","stylers":[{"hue":"#5f5855"},{"saturation":6},{"lightness":-31},{"visibility":"on"}]},{"featureType":"road.local","elementType":"all","stylers":[{"hue":"#ffffff"},{"saturation":-100},{"lightness":100},{"visibility":"simplified"}]},{"featureType":"water","elementType":"all","stylers":[]}]

	// This is fired after the server has done it's thing
	$rootScope.$on("runMapCtrl", () => {

		// Get the map instance
		NgMap.getMap().then((map) => {

			// Set these to be local and scope vars
			inst.map = map;
			$scope.scopeMap = map;

			// Show a skateparks InfoWindow when clicked
			// Not using an arrow function as it messes up the reference to 'this'
			$scope.showSkateparkDetails = function(event, skatepark) {
				$scope.currentSkatepark = skatepark;
		    	inst.map.showInfoWindow('detailsWindow', skatepark._id);
			};


			/* DISCLAIMER 

				The below code is a horrible, horrible hack to remove the default InfoWindow style from Google.
				It's prone to errors, so it will probably be removed completely and just go with the default styling

			*/

			// Show at least one so it gets added to the DOM
		    inst.map.showInfoWindow('detailsWindow', "showMePlease");

		    // Delete the 'fake' scope so they all disappear
			$scope.fake = [];

			// Remove the horrible default infowindow style
			// This is a hack and I hate using setTimeout, but Google don't let you modify the infoWindow easily!
			// TODO - Move this to its own helper service
			setTimeout(() => {

				inst.map.hideInfoWindow('detailsWindow', "showMePlease");

				const iwOuter = $('.gm-style-iw');
				const iwBackground = iwOuter.prev();

				// Remove the InfoWindow Frame
				iwBackground.children(':nth-child(1)').css({'display' : 'none'});
				iwBackground.children(':nth-child(2)').css({'display' : 'none'});
				iwBackground.children(':nth-child(3)').css({'display' : 'none'});
				iwBackground.children(':nth-child(4)').css({'display' : 'none'});

				setTimeout(() => {

					// Remove preloader
						$(".preload").fadeOut(() => {
							$(this).hide();
						})

				}, 300)

			}, 100)


			// NOW THE FUN STUFF

			// Make the map clickable
			google.maps.event.addListener(inst.map, "click", (event) => {

				// get the latLng from precisely where the user clicked
				const clickedLocation = [{
					location: [
						event.latLng.lat(),
						event.latLng.lng(),
					]
				}];

				// $apply binds stuff that would normally automagically work where the click event handler screws it up
				$scope.$apply(function(){
					$scope.clickedLocation = clickedLocation;
				})

				// show an InfoWindow
				inst.map.showInfoWindow('newSkateparkWindow', "inProgressMarker");

				$("#uploadScrollbar").hide();

				// Allow form to be submitted
				$scope.submitNewSkateparkForm = () => {
					$rootScope.$broadcast("addNewSkatepark");
				}

			});



		});

	});

	$rootScope.$on("filterMarkers", function(event, data){

		$scope.parks = data;

	});

	$rootScope.$on("pushLastToScope", function(event, data){

		$scope.allData.push(data);

	});

});

// Vote Controller - to allow the user only be able to vote on an item once
app.controller("VoteCtrl", ($scope, $rootScope, localStorageService) => {

	$rootScope.$on("runVoteCtrl", () => {

		// add a prop to each element in the allData array to mention if it matches the id of that in LocalStorage
		let votedFor = localStorageService.get("spUsrHasAdded");

		// NOTE, this can definitely be optimised, but i need to read up on the big O to find out the best way
		// Cycle through all data 
		$.each($scope.allData, (allDataPointer, allDataVal) => {

			// sub-list: cycle through localstorage data
			$.each(votedFor, (lsPointer, lsVal) => {

				if (allDataVal._id === lsVal._id)
				{
					$scope.allData[allDataPointer].hasVote = true;
				}

			});


		});
	})

});

// Responsive Controller - Allow the toggle button to switch between hidden/shown panels
app.controller("responsiveCtrl", ($scope, $rootScope, NgMap, mapService) => {

	$scope.togglePanel = () => {

		if($(".left-column").hasClass("big-left") || $(".left-column").hasClass("little-right"))
		{
			$(".left-column").removeClass("big-left");
			$(".right-column").removeClass("little-right");
		}
		else
		{
			$(".left-column").addClass("big-left");
			$(".right-column").addClass("little-right");
		}

		NgMap.getMap().then((map) => {

		 	setTimeout(function(){
				google.maps.event.trigger(map, 'resize')
		 	},700)

		 });

	}

});

// File Controller - Handles uploads of skatepark screenshots to the server
app.controller("addNewSkateparkCtrl", ($scope, $http, $rootScope, $location, NgMap, cloudinaryUploadService, Upload) => {


	// Is called at some point in the future when the form on the InfoWindow is submitted
	$rootScope.$on("addNewSkatepark", () => {

		if (!$scope.skateparkName || !$scope.adderName ) return;
		else
		{
			if (!$scope.screenshots)
			{
				submitMetaToMongoDb($scope.skateparkName, $scope.skateparkDesc, $scope.clickedLocation, $scope.adderName, null);
				$("#uploadScrollbar div").width("100%");
			}

			else if ($scope.screenshots)
			{
				$.each($scope.screenshots, (pointer, file) => {

					// Show progress bar

					Upload.upload({

						url: "https://api.cloudinary.com/v1_1/lgycbktyo/upload",
						data: {
							upload_preset: "p0cxg2v9",
							tags: 'skateparkimages',
							context: 'photo=filenamehere',
							file: file
						}

					}).progress((event) => {
						let progress = Math.round((event.loaded * 100.0) / event.total);

						$("#uploadScrollbar div").width(progress + "%");

					}).success((data, status, headers, config) => {

						$("#uploadScrollbar div").width("100%");

						if (status === 200) submitMetaToMongoDb($scope.skateparkName, $scope.skateparkDesc, $scope.clickedLocation, $scope.adderName, data);

					});

				}); // End all file uploads

			}
		}

	});

	// Internal functions
	const submitMetaToMongoDb = (skateparkName, skateparkDesc, skateparkLocation, skateparkAdder, cloudinaryImageMeta) => {

		console.log(skateparkName);
		console.log(skateparkDesc);
		console.log(skateparkLocation);
		console.log(skateparkAdder);
		console.log(cloudinaryImageMeta);

		/* The MongoDB schema for this is follows;

			skateparkName: {type: String, required: true},
			skateparkDesc: {type: String, required: false},
			skateparkRating: {type: Number, required: false}, 						<--- Will always be set to 1.
			skateparkLocation: {type: [Number], required: false}, // [Long, Lat]
			skateparkImages: {type: Array, required: false},
			addedBy: String,
			createdAt: {type: Date, default: Date.now} 								<--- will be created automatically.

		*/

	}

});
