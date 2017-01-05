"use strict";
var dp = {};

// Pendula lengths and masses.
dp.l1 = 100;
dp.l2 = 100;
dp.m1 = 1;
dp.m2 = 1;

dp.dataStore = (function() {

  // The generated data as a string, of the form x1,y1|x2,y2|...
  var dataString = "";
  // [theta1, theta2, omega1, omega2] arrays, either initial conditions
  // or final conditions.
  var initialPoint = [0, 0, 0, 0];
  var finalPoint = [0, 0, 0, 0];
  return {
    dataString : function() { return dataString; },
    setDataString : function(s) { dataString = s; },
    setInitialConditions : function(data) {
      initialPoint[0] = parseFloat(data[0]);
      initialPoint[1] = parseFloat(data[1]);
      initialPoint[2] = parseFloat(data[2]);
      initialPoint[3] = parseFloat(data[3]);
    },
    clearData : function() {
      dataString = "";
      initialPoint = [0, 0, 0, 0];
      finalPoint = [0, 0, 0, 0];
    },
    initialData : function() {
      return initialPoint;
    },
    setInitialData : function(data) {
      initialPoint = data.slice();
    },
    finalData : function() {
      return finalPoint;
    },
    setFinalData : function(data) {
      finalPoint = data.slice();
    }
  };
}());

dp.setConstants = function(data) {

  dp.l1 = parseFloat(data[0]);
  dp.l2 = parseFloat(data[1]);
  dp.m1 = parseFloat(data[2]);
  dp.m2 = parseFloat(data[3]);
};

dp.generateData = function(steps) {

  var h = 0.005; // Time step.
  var l1 = dp.l1;
  var l2 = dp.l2;
  var m1 = dp.m1;
  var m2 = dp.m2;
  var M = m1 + m2;
  //var g = 9.80665;-->hard coded
  // omega1 and omega2 formulas are from
  // https://freddie.witherden.org/tools/doublependulum/
  // I think some other sources on the web may have them wrong.
  // omega1 = (d/dt)theta1
  var f3 = (function(m1, m2, M, l1, l2, sin, cos) {
    return function(y1, y2, y3, y4) {
      return (m2 * l1 * y3 * y3 * sin(y2 - y1) * cos(y2 - y1) + 
              m2 * 9.80665 * sin(y2) * cos(y2 - y1) +
              m2 * l2 * y4 * y4 * sin(y2 - y1) - M * 9.80665 * sin(y1)) /
        (M * l1 - m2 * l1 * cos(y2 - y1) * cos(y2 - y1));
    };
  }(m1, m2, M, l1, l2, Math.sin, Math.cos));
  // omega2 = (d/dt)theta2
  var f4 = (function(m1, m2, M, l1, l2, sin, cos) {
    return function(y1, y2, y3, y4) {
      return (-m2 * l2 * y4 * y4 * sin(y2 - y1) * cos(y2 - y1) +
              M * 9.80665 * sin(y1) * cos(y2 - y1) -
              M * l1 * y3 * y3 * sin(y2 - y1) - M * 9.80665 * sin(y2)) /
        (M * l2 - m2 * l2 * cos(y2 - y1) * cos(y2 - y1));
    };
  }(m1, m2, M, l1, l2, Math.sin, Math.cos));
  var cur = dp.dataStore.initialData();
  // Start the data run - the final result will be a |-separated
  // list of comma-separated x,y values.
  var data = cur[0] + ',' + cur[1];
  // We only actually report every keepStepModulus'th data point.
  var keepStepModulus = 40;
  // For simplicity we need to end on a step that we keep (so that cur
  // actually comes out as the final data point at the end of the
  // loop).
  steps = steps * keepStepModulus + 1;
  var i;
  for (i = 0; i < steps; ++i) {

    var y1n = cur[0]; // theta1
    var y2n = cur[1]; // theta2
    var y3n = cur[2]; // omega1 = dtheta1/dt
    var y4n = cur[3]; // omega2 = dtheta2/dt
    // Compute the next iteration "y_{n+1}" using classical Runge-Kutta.
    var a1 = h * y3n;
    var a2 = h * y4n;
    var a3 = h * f3(y1n, y2n, y3n, y4n);
    var a4 = h * f4(y1n, y2n, y3n, y4n);
    var b1 = h * (y3n + 0.5 * a3);
    var b2 = h * (y4n + 0.5 * a4);
    var b3 = h * f3(y1n + 0.5 * a1, y2n + 0.5 * a2,
                  y3n + 0.5 * a3, y4n + 0.5 * a4);
    var b4 = h * f4(y1n + 0.5 * a1, y2n + 0.5 * a2,
                  y3n + 0.5 * a3, y4n + 0.5 * a4);
    var c1 = h * (y3n + 0.5 * b3);
    var c2 = h * (y4n + 0.5 * b4);
    var c3 = h * f3(y1n + 0.5 * b1, y2n + 0.5 * b2,
                  y3n + 0.5 * b3, y4n + 0.5 * b4);
    var c4 = h * f4(y1n + 0.5 * b1, y2n + 0.5 * b2,
                  y3n + 0.5 * b3, y4n + 0.5 * b4);
    var d1 = h * (y3n + c3);
    var d2 = h * (y4n + c4);
    var d3 = h * f3(y1n + c1, y2n + c2, y3n + c3, y4n + c4);
    var d4 = h * f4(y1n + c1, y2n + c2, y3n + c3, y4n + c4);
    var y1new = y1n + a1 / 6 + b1 / 3 + c1 / 3 + d1 / 6;
    var y2new = y2n + a2 / 6 + b2 / 3 + c2 / 3 + d2 / 6;
    var y3new = y3n + a3 / 6 + b3 / 3 + c3 / 3 + d3 / 6;
    var y4new = y4n + a4 / 6 + b4 / 3 + c4 / 3 + d4 / 6;
    // Save for the next iteration.
    cur = [y1new, y2new, y3new, y4new];
    if (i % keepStepModulus === 0) {
      data += '|' + y1new + ',' + y2new;
    }
  }
  dp.dataStore.setDataString(data);
  dp.dataStore.setFinalData(cur);
};

onmessage = function(event) {

  var message = event.data;
  var controlChar = message.charAt(0);
  message = message.substring(1);
  if (controlChar === 'c') { // 'c'onfig
    var dataArray = message.split('|');
    dp.setConstants(dataArray);
  } else if (controlChar === 's') { // 's'tart data generation
    dp.dataStore.clearData();
    var parts = message.split('!');
    var numDatapointsRequested = parts[0];
    var initialConditions = parts[1].split('|');
    dp.dataStore.setInitialConditions(initialConditions);
    dp.generateData(numDatapointsRequested);
    // Now return the data.
    var lastDataPoint = dp.dataStore.finalData();
    var lastDataString = lastDataPoint.join('|');
    postMessage(lastDataString + '!' + dp.dataStore.dataString());
    dp.dataStore.clearData();
  }
};
