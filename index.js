"use strict";
var dp = {};

// The web worker that actually generates our data (see dpWorker.js).
dp.worker = null;
// One call to draw() produces one frame of output; we create draw()
// (with initializeDrawer()) each time the control parameters change
// so that the parameters are "baked in".
dp.draw = function() {};
// dp.draw is called through a timer - remember which one.
dp.drawTimerID = 0;
// The number of data points we (typically) ask for on each call to
// the worker.
dp.dataFetchSize = 520;

// Store and serve data for the simulation.
dp.dataStore = (function() {

  // Two element array: current data set (index specified by
  // |curDataIndex|) and next data set (the other index).
  // Each |data| item is stored as a string in the form
  // theta_1-coord,theta_2-coord|theta_1-coord,theta_2-coord|...
  // |lastPoint| includes velocity in addition to position (used to start
  // the next data request) in the form
  // theta_1,theta_2,omega_1,omega_2
  var data = [{data: "", lastPoint: ""}, {data: "", lastPoint: ""}];
  // Specifies which index of data is currently in use (0 or 1).
  var curDataIndex = 0;
  var nextDataIndex = function() {
    return (curDataIndex + 1) % 2;
  };

  return {
    addData : function(newData, lastDataPoint) {
      // Always put new data at the inactive (non-drawing) data index.
      var newIndex = nextDataIndex();
      data[newIndex].data = newData;
      data[newIndex].lastPoint = lastDataPoint;
      this.onDataLoaded();
    },
    getNextData : function() {
      curDataIndex = nextDataIndex();
      return data[curDataIndex].data;
    },
    getCurLastPoint : function() {
      return data[curDataIndex].lastPoint;
    },
    // Function called when new data is loaded - set/reset it as needed.
    onDataLoaded : function() {}
  };
}());

//////////////////////////////////////////////////////////////////////

// Creates a dp.draw function given the lengths l1 and l2 of the two
// arms of the pendulum.
dp.initializeDrawer = function(l1, l2) {
  // The actual list of coordinates to be drawn gets filled in
  // the first time draw() is called (see the else leg below).
  var coords = [];
  var dataLength = coords.length;
  var dataLengthOver2 = parseInt(dataLength / 2, 10);
  var i = 0;
  // Drawer constants.
  var line1 = document.getElementById('line1');
  var line2 = document.getElementById('line2');
  var trail = document.getElementById('trail');
  var sin = Math.sin;
  var cos = Math.cos;
  var PI = Math.PI;
  dp.draw = function() {

    if (i < dataLength) {
      //// (On long runs there is an appreciable difference between using
      //// split and using indexOf/substring, at least on ff...)
      //var angles = coords[i].split(',');
      //var theta1 = angles[0];
      //var theta2 = angles[1];
      var theseCoords = coords[i];
      var comma = theseCoords.indexOf(',');
      var theta1 = theseCoords.substring(0, comma);
      var theta2 = theseCoords.substring(comma + 1);
      // Coordinates of the first pendulum.
      var x1 = l1 * sin(theta1);
      var y1 = -l1 * cos(theta1);
      // Coordinates of the second pendulum.
      var x2 = x1 + l2 * sin(theta2);
      var y2 = y1 - l2 * cos(theta2);
      x1 = Math.round(x1 * 100) / 100;
      x2 = Math.round(x2 * 100) / 100;
      y1 = Math.round(y1 * 100) / 100;
      y2 = Math.round(y2 * 100) / 100;
      if (dp.trailOn) {
        var trailData = trail.getAttributeNS(null, "points");
        if (trailData.length > 1800) {
          // Remove the first point from the trail.
          var firstSpace = trailData.indexOf(' ');
          trailData = trailData.substring(firstSpace + 1);
        }
        var separator = " ";
        if (!trailData) {
          // IE10 has undefined behavior if there's a space at the end
          // of the list, so yeah, avoid that.
          // TODO: arrange things so that we can get rid of this check
          // (need to know the point being drawn when the trail is turned
          // on).
          separator = "";
        }
        // Append the new point to the trail.
        trailData = trailData + separator + x2 + "," + y2;
        trail.setAttributeNS(null, "points", trailData);
      }
      line1.setAttributeNS(null, 'y2', y1);
      line1.setAttributeNS(null, 'x2', x1);
      line2.setAttributeNS(null, 'y2', y2);
      line2.setAttributeNS(null, 'x2', x2);
      line2.setAttributeNS(null, 'y1', y1);
      line2.setAttributeNS(null, 'x1', x1);
      i = i + 1;
      if (i === dataLengthOver2) { // Fetch the next data set.
        var lastPoint = dp.dataStore.getCurLastPoint();
        dp.worker.postMessage("s" + dp.dataFetchSize + "!" + lastPoint);
      }
    } else { // Ran out of data - load us up.
      coords = dp.dataStore.getNextData().split('|');
      dataLength = coords.length;
      dataLengthOver2 = parseInt(dataLength / 2, 10);
      i = 0;
    }
  };
};

// We better use degrees on the user side.
dp.fetchAngle = function(id) {
  var value = document.getElementById(id).value;
  return value * Math.PI / 180; // Return radians.
};
// Note special behavior for fetching angles.
dp.fetchValue = function(id) {
  if (id === "t1" || id === "t2" || id === "o1" || id === "o2") {
    return dp.fetchAngle(id);
  } else {
    return document.getElementById(id).value;
  }
};
dp.setAngle = function(id, radValue) {
  var degValue = radValue * 180 / Math.PI; // Set to degrees.
  document.getElementById(id).value = degValue;
};
dp.setValue = function(id, value) {
  if (id === "t1" || id === "t2" || id === "o1" || id === "o2") {
    dp.setAngle(id, value);
  } else {
    document.getElementById(id).value = value;
  }
};

dp.getInitialConditions = function() {

  var f = dp.fetchValue;
  return [f('t1'), f('t2'), f('o1'), f('o2')];
};

dp.getParameters = function() {

  var f = dp.fetchValue;
  return [f('l1'), f('l2'), f('m1'), f('m2')];
};

// Event handler for user clicking the Start/Pause button.
dp.startPause = function() {

  var startPause = document.getElementById('startPause');
  var curValue = startPause.value;
  var newValue = "OOPS";
  if (curValue === "Start") { // First start with cur control form values.
    newValue = "Pause";
    // Disable the button while we fetch the initial dataset.
    startPause.disabled = true;
    // What to do when the first dataset arrives.
    dp.dataStore.onDataLoaded = (function() {
      return function() {
        dp.drawTimerID = setInterval(dp.draw, 25);
        startPause.disabled = false;
        dp.dataStore.onDataLoaded = (function() { return function() {};}());
      };
    }());
    // On the first request, only fetch half the normal number of datapoints.
    var fetchSize = parseInt(dp.dataFetchSize / 2, 10);
    dp.worker.postMessage("s" + fetchSize + "!" +
                          dp.getInitialConditions().join('|'));
  } else if (curValue === "Continue") {
    newValue = "Pause";
    dp.drawTimerID = setInterval(dp.draw, 25); // Restart drawing.
  } else { // Pause.
    newValue = "Continue";
    if (dp.drawTimerID) {
      clearInterval(dp.drawTimerID);
    }
  }
  startPause.value = newValue;
};

dp.initializeControlValues = function() {

  var set = dp.setValue;
  // Check if previous settings have been saved in localStorage.
  if (localStorage && localStorage.getItem("l1")) {
    set('l1', localStorage.getItem("l1"));
    set('l2', localStorage.getItem("l2"));
    set('m1', localStorage.getItem("m1"));
    set('m2', localStorage.getItem("m2"));
    set('t1', localStorage.getItem("t1"));
    set('t2', localStorage.getItem("t2"));
    set('o1', localStorage.getItem("o1"));
    set('o2', localStorage.getItem("o2"));
  } else { // Use defaults defined here.
    set('l1', '240');
    set('l2', '100');
    set('m1', '1');
    set('m2', '1');
    set('t1', '3.12413936106985'); // 179 degrees
    set('t2', '3.12413936106985'); // 179 degrees
    set('o1', '0');
    set('o2', '0');
  }
};

dp.storeConfigValues = function() {

  if (localStorage) {
    var f = dp.fetchValue;
    localStorage.setItem("l1", f('l1'));
    localStorage.setItem("l2", f('l2'));
    localStorage.setItem("m1", f('m1'));
    localStorage.setItem("m2", f('m2'));
    localStorage.setItem("t1", f('t1'));
    localStorage.setItem("t2", f('t2'));
    localStorage.setItem("o1", f('o1'));
    localStorage.setItem("o2", f('o2'));
  }
};

dp.initializeWorkerAndDrawer = function() {

  var configParameters = dp.getParameters();
  dp.worker.postMessage("c" + configParameters.join('|'));
  dp.initializeDrawer(configParameters[0], configParameters[1]);
};

dp.loadNewDrawer = function() {

  // Start by making sure the old drawer is stopped.
  if (dp.drawTimerID) {
    clearInterval(dp.drawTimerID);
  }
  var goodNewValues = dp.checkControlValues();
  var startPause = document.getElementById('startPause');
  if (goodNewValues) {
    startPause.disabled = true;
    dp.initializeWorkerAndDrawer();
    dp.drawInitialPendulum();
    dp.storeConfigValues();
    startPause.disabled = false;
    startPause.value = "Start";
  } else {
    startPause.value = "Continue";
  }
};

dp.checkControlValues = function() {

  var f = dp.fetchValue;
  var l1 = f('l1');
  var l2 = f('l2');
  var m1 = f('m1');
  var m2 = f('m2');
  var t1 = f('t1');
  var t2 = f('t2');
  var o1 = f('o1');
  var o2 = f('o2');
  if (!dp.isNum(l1) || !dp.isNum(l2) || !dp.isNum(m1) || !dp.isNum(m2) ||
      !dp.isNum(t1) || !dp.isNum(t2) || !dp.isNum(o1) || !dp.isNum(o2)) {
    alert("All entries must be numbers.");
    return false;
  }
  // TODO: getting NaN's when lengths or masses are too small - why?
  if (l1 < 0.01 || l2 < 0.01) {
    alert("Sorry, lengths must be at least .01.");
    return false;
  }
  if (l1 > 1000 || l2 > 1000) {
    alert("Sorry, lengths must be less than 1000.");
    return false;
  }
  if (m1 < 0.01 || m2 < 0.01) {
    alert("Sorry, masses must be at least .01.");
    return false;
  }
  var twoPi = Math.PI * 2;
  if (Math.abs(o1) > twoPi || Math.abs(o2) > twoPi) {
    alert("Sorry, angular velocities can't be more than 360.");
    return false;
  }
  return true;
};

dp.drawInitialPendulum = function() {

  var inits = dp.getInitialConditions();
  var theta1 = inits[0];
  var theta2 = inits[1];
  var params = dp.getParameters();
  var l1 = params[0];
  var l2 = params[1];
  // Coordinates of the end of the first pendulum.
  var x1 = l1 * Math.sin(theta1);
  var y1 = -l1 * Math.cos(theta1);
  // Coordinates of the end of the second pendulum.
  var x2 = x1 + l2 * Math.sin(theta2);
  var y2 = y1 - l2 * Math.cos(theta2);
  x1 = Math.round(x1*100)/100;
  x2 = Math.round(x2*100)/100;
  y1 = Math.round(y1*100)/100;
  y2 = Math.round(y2*100)/100;
  var line1 = document.getElementById('line1');
  var line2 = document.getElementById('line2');
  line1.setAttributeNS(null, 'y2', y1);
  line1.setAttributeNS(null, 'x2', x1);
  line2.setAttributeNS(null, 'y2', y2);
  line2.setAttributeNS(null, 'x2', x2);
  line2.setAttributeNS(null, 'y1', y1);
  line2.setAttributeNS(null, 'x1', x1);
  var trail = document.getElementById('trail');
  trail.setAttributeNS(null, 'points', "");
};

dp.setTrail = function() {

  var checked = document.getElementById('trailCheckbox').checked;
  if (checked) {
    dp.trailOn = true;
  } else {
    dp.trailOn = false;
    var trail = document.getElementById('trail');
    trail.setAttributeNS(null, "points", "");
  }
};

// Get textual SVG of the pendulua currently being drawn, and put it
// in the "Get SVG" text box for the user to copy.
dp.generateSVG = function() {

  var svgElement = document.getElementById('pendula');
  var svgText = svgElement.innerHTML;
  // Do a little cleanup.
  svgText = svgText.replace(/^\n/, "");
  svgText = svgText.replace(/\n$/, "");
  svgText = svgText.replace(/ id="[\w\-]+"/g, "");
  // If there isn't a trail then don't include the empty trail.
  svgText =
    svgText.replace(/ *<polyline[="\w\s\-]*points=""><\/polyline>\n/,"");
  document.getElementById('svgText').value = svgText;
};

dp.elementDisplayer = function(elementToDisplay) {

  return function() { // Switch the visibility of elementToDisplay.
    var element = document.getElementById(elementToDisplay);
    var newVisibility = 'visible';
    if (element.style.visibility === 'visible') {
      newVisibility = 'hidden';
    }
    element.style.visibility = newVisibility;
  };
};

dp.browserIsSupported = function() {

  // Test for support of web workers and svg.
  var browserIsSupported = true;
  if (!window.Worker) {
    browserIsSupported = false;
    document.getElementById('noSupport').style.display = "block";
    document.getElementById('noWorkerSupport').style.display = "block";
  }
  // http://www.voormedia.nl/blog/2012/10/displaying-and-detecting-support-for-svg-images
  if (!document.implementation.hasFeature("http://www.w3.org/TR/SVG11/feature#Image", "1.1")) {
    browserIsSupported = false;
    document.getElementById('noSupport').style.display = "block";
    document.getElementById('noSVGSupport').style.display = "block";
  }
  return browserIsSupported;
};

dp.setControlsHelpHeight = function() {
  var controlsHeight = document.getElementById('controls').offsetHeight;
  var controlsHelp = document.getElementById('controlsHelp');
  // Height is unkown until rendering, so here we are.
  controlsHelp.style.top = (controlsHeight - 10) + "px";
};

window.addEventListener("resize", function() {
  dp.setControlsHelpHeight();
});

window.addEventListener("load", function() {

  if (!dp.browserIsSupported()) {
    return;
  }

  dp.initializeControlValues();
  document.getElementById('startPause').onclick = dp.startPause;
  document.getElementById('reload').onclick = dp.loadNewDrawer;
  var trailCheckbox = document.getElementById('trailCheckbox');
  trailCheckbox.onclick = dp.setTrail;
  dp.trailOn = trailCheckbox.checked;
  document.getElementById("genSVG").onclick = dp.generateSVG;
  document.getElementById('svgText').value = "";
  dp.setControlsHelpHeight();
  document.getElementById('controlsHelpButton').onclick =
    dp.elementDisplayer('controlsHelp');
  document.getElementById('getSVGHelpButtonSVG').onclick =
    dp.elementDisplayer('getSVGHelpText');
  var getSVGHeight = document.getElementById('getSVGHeader').offsetHeight;
  var getSVGHelpText = document.getElementById('getSVGHelpText');
  getSVGHelpText.style.top = getSVGHeight + "px";

  dp.worker = new Worker('dpWorker.js');
  // Ideally we would be passing JSON data by reference (not copy), but word on
  // the web is that IE10 still doesn't support even passing objects, much less
  // by reference.  Another alternative is encoding/parsing JSON strings, but
  // that's slower than this and not much simpler.
  dp.worker.onmessage = (function() {
    return function(event) {

      var message = event.data;
      var controlChar = message.charAt(0);
      if (controlChar === "d") { // "d"ebug
        //console.log("debug: " + message);
      } else { // Data.
        var splitIndex = message.indexOf('!');
        var lastDataPoint = message.substring(0, splitIndex);
        var data = message.substring(splitIndex + 1);
        dp.dataStore.addData(data, lastDataPoint);
      }
    };
  }());
  dp.loadNewDrawer();
});

// http://stackoverflow.com/questions/18082/validate-numbers-in-javascript-isnumeric
dp.isNum = function (n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
};
