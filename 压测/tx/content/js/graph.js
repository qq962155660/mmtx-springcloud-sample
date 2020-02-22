/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 28800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 28800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 99.0, "minX": 0.0, "maxY": 2202.0, "series": [{"data": [[0.0, 99.0], [0.1, 111.0], [0.2, 114.0], [0.3, 114.0], [0.4, 124.0], [0.5, 127.0], [0.6, 132.0], [0.7, 135.0], [0.8, 135.0], [0.9, 147.0], [1.0, 161.0], [1.1, 164.0], [1.2, 165.0], [1.3, 167.0], [1.4, 167.0], [1.5, 173.0], [1.6, 175.0], [1.7, 175.0], [1.8, 181.0], [1.9, 182.0], [2.0, 188.0], [2.1, 191.0], [2.2, 191.0], [2.3, 191.0], [2.4, 199.0], [2.5, 199.0], [2.6, 208.0], [2.7, 211.0], [2.8, 219.0], [2.9, 224.0], [3.0, 226.0], [3.1, 229.0], [3.2, 241.0], [3.3, 247.0], [3.4, 250.0], [3.5, 251.0], [3.6, 252.0], [3.7, 252.0], [3.8, 253.0], [3.9, 264.0], [4.0, 264.0], [4.1, 269.0], [4.2, 272.0], [4.3, 276.0], [4.4, 283.0], [4.5, 287.0], [4.6, 292.0], [4.7, 293.0], [4.8, 294.0], [4.9, 295.0], [5.0, 295.0], [5.1, 296.0], [5.2, 298.0], [5.3, 301.0], [5.4, 303.0], [5.5, 308.0], [5.6, 310.0], [5.7, 316.0], [5.8, 316.0], [5.9, 317.0], [6.0, 319.0], [6.1, 319.0], [6.2, 321.0], [6.3, 322.0], [6.4, 322.0], [6.5, 329.0], [6.6, 329.0], [6.7, 330.0], [6.8, 332.0], [6.9, 334.0], [7.0, 335.0], [7.1, 336.0], [7.2, 341.0], [7.3, 343.0], [7.4, 343.0], [7.5, 344.0], [7.6, 344.0], [7.7, 344.0], [7.8, 347.0], [7.9, 350.0], [8.0, 354.0], [8.1, 355.0], [8.2, 355.0], [8.3, 357.0], [8.4, 360.0], [8.5, 361.0], [8.6, 362.0], [8.7, 365.0], [8.8, 366.0], [8.9, 370.0], [9.0, 371.0], [9.1, 375.0], [9.2, 376.0], [9.3, 380.0], [9.4, 381.0], [9.5, 381.0], [9.6, 381.0], [9.7, 385.0], [9.8, 388.0], [9.9, 394.0], [10.0, 395.0], [10.1, 397.0], [10.2, 397.0], [10.3, 398.0], [10.4, 398.0], [10.5, 399.0], [10.6, 400.0], [10.7, 400.0], [10.8, 402.0], [10.9, 403.0], [11.0, 404.0], [11.1, 405.0], [11.2, 407.0], [11.3, 411.0], [11.4, 411.0], [11.5, 415.0], [11.6, 415.0], [11.7, 415.0], [11.8, 415.0], [11.9, 415.0], [12.0, 416.0], [12.1, 416.0], [12.2, 417.0], [12.3, 417.0], [12.4, 420.0], [12.5, 423.0], [12.6, 429.0], [12.7, 431.0], [12.8, 433.0], [12.9, 433.0], [13.0, 434.0], [13.1, 436.0], [13.2, 436.0], [13.3, 438.0], [13.4, 438.0], [13.5, 439.0], [13.6, 442.0], [13.7, 443.0], [13.8, 443.0], [13.9, 443.0], [14.0, 443.0], [14.1, 443.0], [14.2, 444.0], [14.3, 445.0], [14.4, 445.0], [14.5, 445.0], [14.6, 447.0], [14.7, 447.0], [14.8, 448.0], [14.9, 448.0], [15.0, 449.0], [15.1, 449.0], [15.2, 449.0], [15.3, 449.0], [15.4, 450.0], [15.5, 451.0], [15.6, 452.0], [15.7, 452.0], [15.8, 453.0], [15.9, 454.0], [16.0, 454.0], [16.1, 454.0], [16.2, 454.0], [16.3, 454.0], [16.4, 456.0], [16.5, 456.0], [16.6, 456.0], [16.7, 458.0], [16.8, 461.0], [16.9, 461.0], [17.0, 462.0], [17.1, 462.0], [17.2, 462.0], [17.3, 462.0], [17.4, 463.0], [17.5, 463.0], [17.6, 464.0], [17.7, 464.0], [17.8, 464.0], [17.9, 465.0], [18.0, 466.0], [18.1, 467.0], [18.2, 467.0], [18.3, 468.0], [18.4, 468.0], [18.5, 469.0], [18.6, 469.0], [18.7, 469.0], [18.8, 470.0], [18.9, 471.0], [19.0, 471.0], [19.1, 472.0], [19.2, 472.0], [19.3, 472.0], [19.4, 473.0], [19.5, 473.0], [19.6, 474.0], [19.7, 474.0], [19.8, 474.0], [19.9, 474.0], [20.0, 475.0], [20.1, 475.0], [20.2, 475.0], [20.3, 475.0], [20.4, 476.0], [20.5, 477.0], [20.6, 477.0], [20.7, 477.0], [20.8, 477.0], [20.9, 478.0], [21.0, 478.0], [21.1, 479.0], [21.2, 479.0], [21.3, 480.0], [21.4, 480.0], [21.5, 482.0], [21.6, 483.0], [21.7, 484.0], [21.8, 485.0], [21.9, 488.0], [22.0, 490.0], [22.1, 490.0], [22.2, 491.0], [22.3, 491.0], [22.4, 491.0], [22.5, 493.0], [22.6, 494.0], [22.7, 495.0], [22.8, 497.0], [22.9, 501.0], [23.0, 501.0], [23.1, 501.0], [23.2, 505.0], [23.3, 505.0], [23.4, 507.0], [23.5, 507.0], [23.6, 508.0], [23.7, 508.0], [23.8, 508.0], [23.9, 509.0], [24.0, 509.0], [24.1, 510.0], [24.2, 511.0], [24.3, 511.0], [24.4, 511.0], [24.5, 511.0], [24.6, 511.0], [24.7, 512.0], [24.8, 513.0], [24.9, 513.0], [25.0, 513.0], [25.1, 514.0], [25.2, 514.0], [25.3, 515.0], [25.4, 515.0], [25.5, 515.0], [25.6, 516.0], [25.7, 516.0], [25.8, 517.0], [25.9, 517.0], [26.0, 517.0], [26.1, 517.0], [26.2, 518.0], [26.3, 518.0], [26.4, 518.0], [26.5, 518.0], [26.6, 519.0], [26.7, 520.0], [26.8, 520.0], [26.9, 520.0], [27.0, 521.0], [27.1, 521.0], [27.2, 521.0], [27.3, 523.0], [27.4, 524.0], [27.5, 524.0], [27.6, 525.0], [27.7, 525.0], [27.8, 525.0], [27.9, 525.0], [28.0, 525.0], [28.1, 525.0], [28.2, 525.0], [28.3, 526.0], [28.4, 526.0], [28.5, 526.0], [28.6, 526.0], [28.7, 526.0], [28.8, 527.0], [28.9, 527.0], [29.0, 528.0], [29.1, 529.0], [29.2, 529.0], [29.3, 530.0], [29.4, 530.0], [29.5, 530.0], [29.6, 530.0], [29.7, 530.0], [29.8, 530.0], [29.9, 531.0], [30.0, 531.0], [30.1, 531.0], [30.2, 531.0], [30.3, 531.0], [30.4, 532.0], [30.5, 532.0], [30.6, 532.0], [30.7, 534.0], [30.8, 534.0], [30.9, 534.0], [31.0, 534.0], [31.1, 534.0], [31.2, 535.0], [31.3, 535.0], [31.4, 535.0], [31.5, 535.0], [31.6, 535.0], [31.7, 536.0], [31.8, 536.0], [31.9, 536.0], [32.0, 536.0], [32.1, 536.0], [32.2, 537.0], [32.3, 537.0], [32.4, 537.0], [32.5, 537.0], [32.6, 538.0], [32.7, 538.0], [32.8, 538.0], [32.9, 539.0], [33.0, 539.0], [33.1, 539.0], [33.2, 539.0], [33.3, 540.0], [33.4, 540.0], [33.5, 540.0], [33.6, 541.0], [33.7, 542.0], [33.8, 542.0], [33.9, 542.0], [34.0, 542.0], [34.1, 542.0], [34.2, 543.0], [34.3, 543.0], [34.4, 543.0], [34.5, 544.0], [34.6, 544.0], [34.7, 544.0], [34.8, 544.0], [34.9, 544.0], [35.0, 544.0], [35.1, 545.0], [35.2, 545.0], [35.3, 545.0], [35.4, 545.0], [35.5, 545.0], [35.6, 546.0], [35.7, 546.0], [35.8, 546.0], [35.9, 546.0], [36.0, 546.0], [36.1, 547.0], [36.2, 547.0], [36.3, 547.0], [36.4, 547.0], [36.5, 548.0], [36.6, 548.0], [36.7, 548.0], [36.8, 548.0], [36.9, 549.0], [37.0, 549.0], [37.1, 550.0], [37.2, 550.0], [37.3, 550.0], [37.4, 550.0], [37.5, 550.0], [37.6, 550.0], [37.7, 551.0], [37.8, 551.0], [37.9, 551.0], [38.0, 551.0], [38.1, 551.0], [38.2, 552.0], [38.3, 552.0], [38.4, 552.0], [38.5, 552.0], [38.6, 552.0], [38.7, 553.0], [38.8, 553.0], [38.9, 553.0], [39.0, 553.0], [39.1, 553.0], [39.2, 553.0], [39.3, 554.0], [39.4, 554.0], [39.5, 554.0], [39.6, 556.0], [39.7, 557.0], [39.8, 557.0], [39.9, 557.0], [40.0, 558.0], [40.1, 559.0], [40.2, 559.0], [40.3, 559.0], [40.4, 560.0], [40.5, 560.0], [40.6, 561.0], [40.7, 561.0], [40.8, 561.0], [40.9, 562.0], [41.0, 564.0], [41.1, 565.0], [41.2, 565.0], [41.3, 565.0], [41.4, 566.0], [41.5, 566.0], [41.6, 567.0], [41.7, 568.0], [41.8, 568.0], [41.9, 568.0], [42.0, 569.0], [42.1, 569.0], [42.2, 570.0], [42.3, 570.0], [42.4, 570.0], [42.5, 571.0], [42.6, 571.0], [42.7, 571.0], [42.8, 571.0], [42.9, 571.0], [43.0, 572.0], [43.1, 572.0], [43.2, 572.0], [43.3, 573.0], [43.4, 573.0], [43.5, 573.0], [43.6, 574.0], [43.7, 574.0], [43.8, 574.0], [43.9, 574.0], [44.0, 574.0], [44.1, 574.0], [44.2, 575.0], [44.3, 575.0], [44.4, 577.0], [44.5, 577.0], [44.6, 578.0], [44.7, 579.0], [44.8, 580.0], [44.9, 582.0], [45.0, 582.0], [45.1, 582.0], [45.2, 583.0], [45.3, 584.0], [45.4, 584.0], [45.5, 585.0], [45.6, 586.0], [45.7, 586.0], [45.8, 588.0], [45.9, 588.0], [46.0, 588.0], [46.1, 588.0], [46.2, 588.0], [46.3, 589.0], [46.4, 589.0], [46.5, 590.0], [46.6, 590.0], [46.7, 590.0], [46.8, 591.0], [46.9, 591.0], [47.0, 591.0], [47.1, 592.0], [47.2, 592.0], [47.3, 592.0], [47.4, 593.0], [47.5, 594.0], [47.6, 595.0], [47.7, 595.0], [47.8, 596.0], [47.9, 596.0], [48.0, 597.0], [48.1, 598.0], [48.2, 598.0], [48.3, 598.0], [48.4, 598.0], [48.5, 599.0], [48.6, 599.0], [48.7, 602.0], [48.8, 602.0], [48.9, 603.0], [49.0, 604.0], [49.1, 604.0], [49.2, 605.0], [49.3, 605.0], [49.4, 606.0], [49.5, 607.0], [49.6, 607.0], [49.7, 609.0], [49.8, 611.0], [49.9, 611.0], [50.0, 611.0], [50.1, 612.0], [50.2, 612.0], [50.3, 613.0], [50.4, 613.0], [50.5, 614.0], [50.6, 615.0], [50.7, 619.0], [50.8, 622.0], [50.9, 622.0], [51.0, 623.0], [51.1, 625.0], [51.2, 626.0], [51.3, 627.0], [51.4, 628.0], [51.5, 630.0], [51.6, 630.0], [51.7, 632.0], [51.8, 632.0], [51.9, 637.0], [52.0, 637.0], [52.1, 638.0], [52.2, 640.0], [52.3, 642.0], [52.4, 643.0], [52.5, 648.0], [52.6, 649.0], [52.7, 651.0], [52.8, 664.0], [52.9, 665.0], [53.0, 667.0], [53.1, 676.0], [53.2, 680.0], [53.3, 682.0], [53.4, 692.0], [53.5, 695.0], [53.6, 696.0], [53.7, 696.0], [53.8, 697.0], [53.9, 703.0], [54.0, 709.0], [54.1, 714.0], [54.2, 721.0], [54.3, 725.0], [54.4, 736.0], [54.5, 740.0], [54.6, 740.0], [54.7, 751.0], [54.8, 755.0], [54.9, 756.0], [55.0, 758.0], [55.1, 758.0], [55.2, 762.0], [55.3, 769.0], [55.4, 770.0], [55.5, 771.0], [55.6, 772.0], [55.7, 772.0], [55.8, 772.0], [55.9, 773.0], [56.0, 773.0], [56.1, 774.0], [56.2, 774.0], [56.3, 775.0], [56.4, 775.0], [56.5, 775.0], [56.6, 775.0], [56.7, 775.0], [56.8, 776.0], [56.9, 776.0], [57.0, 776.0], [57.1, 777.0], [57.2, 777.0], [57.3, 778.0], [57.4, 779.0], [57.5, 780.0], [57.6, 780.0], [57.7, 780.0], [57.8, 781.0], [57.9, 781.0], [58.0, 782.0], [58.1, 782.0], [58.2, 783.0], [58.3, 783.0], [58.4, 784.0], [58.5, 787.0], [58.6, 787.0], [58.7, 788.0], [58.8, 788.0], [58.9, 789.0], [59.0, 790.0], [59.1, 791.0], [59.2, 791.0], [59.3, 793.0], [59.4, 794.0], [59.5, 794.0], [59.6, 795.0], [59.7, 796.0], [59.8, 796.0], [59.9, 798.0], [60.0, 801.0], [60.1, 801.0], [60.2, 802.0], [60.3, 802.0], [60.4, 802.0], [60.5, 804.0], [60.6, 805.0], [60.7, 806.0], [60.8, 807.0], [60.9, 808.0], [61.0, 809.0], [61.1, 810.0], [61.2, 810.0], [61.3, 813.0], [61.4, 813.0], [61.5, 813.0], [61.6, 813.0], [61.7, 813.0], [61.8, 814.0], [61.9, 814.0], [62.0, 816.0], [62.1, 816.0], [62.2, 817.0], [62.3, 818.0], [62.4, 818.0], [62.5, 821.0], [62.6, 822.0], [62.7, 823.0], [62.8, 823.0], [62.9, 824.0], [63.0, 824.0], [63.1, 824.0], [63.2, 825.0], [63.3, 825.0], [63.4, 826.0], [63.5, 827.0], [63.6, 827.0], [63.7, 828.0], [63.8, 828.0], [63.9, 828.0], [64.0, 828.0], [64.1, 829.0], [64.2, 829.0], [64.3, 829.0], [64.4, 830.0], [64.5, 830.0], [64.6, 831.0], [64.7, 832.0], [64.8, 832.0], [64.9, 833.0], [65.0, 834.0], [65.1, 834.0], [65.2, 834.0], [65.3, 834.0], [65.4, 834.0], [65.5, 834.0], [65.6, 834.0], [65.7, 835.0], [65.8, 835.0], [65.9, 836.0], [66.0, 836.0], [66.1, 837.0], [66.2, 837.0], [66.3, 838.0], [66.4, 838.0], [66.5, 840.0], [66.6, 840.0], [66.7, 840.0], [66.8, 841.0], [66.9, 841.0], [67.0, 842.0], [67.1, 843.0], [67.2, 845.0], [67.3, 847.0], [67.4, 847.0], [67.5, 848.0], [67.6, 850.0], [67.7, 855.0], [67.8, 855.0], [67.9, 856.0], [68.0, 857.0], [68.1, 859.0], [68.2, 863.0], [68.3, 863.0], [68.4, 867.0], [68.5, 870.0], [68.6, 872.0], [68.7, 872.0], [68.8, 872.0], [68.9, 873.0], [69.0, 874.0], [69.1, 875.0], [69.2, 875.0], [69.3, 876.0], [69.4, 879.0], [69.5, 880.0], [69.6, 880.0], [69.7, 881.0], [69.8, 885.0], [69.9, 890.0], [70.0, 892.0], [70.1, 894.0], [70.2, 896.0], [70.3, 897.0], [70.4, 899.0], [70.5, 901.0], [70.6, 902.0], [70.7, 904.0], [70.8, 904.0], [70.9, 905.0], [71.0, 906.0], [71.1, 909.0], [71.2, 910.0], [71.3, 911.0], [71.4, 911.0], [71.5, 913.0], [71.6, 913.0], [71.7, 913.0], [71.8, 913.0], [71.9, 915.0], [72.0, 916.0], [72.1, 916.0], [72.2, 917.0], [72.3, 917.0], [72.4, 917.0], [72.5, 917.0], [72.6, 917.0], [72.7, 918.0], [72.8, 919.0], [72.9, 921.0], [73.0, 921.0], [73.1, 925.0], [73.2, 931.0], [73.3, 931.0], [73.4, 931.0], [73.5, 934.0], [73.6, 936.0], [73.7, 937.0], [73.8, 939.0], [73.9, 939.0], [74.0, 939.0], [74.1, 940.0], [74.2, 940.0], [74.3, 940.0], [74.4, 941.0], [74.5, 942.0], [74.6, 943.0], [74.7, 944.0], [74.8, 946.0], [74.9, 946.0], [75.0, 946.0], [75.1, 947.0], [75.2, 949.0], [75.3, 951.0], [75.4, 952.0], [75.5, 956.0], [75.6, 957.0], [75.7, 960.0], [75.8, 961.0], [75.9, 966.0], [76.0, 967.0], [76.1, 969.0], [76.2, 971.0], [76.3, 972.0], [76.4, 974.0], [76.5, 978.0], [76.6, 981.0], [76.7, 993.0], [76.8, 1010.0], [76.9, 1023.0], [77.0, 1024.0], [77.1, 1056.0], [77.2, 1071.0], [77.3, 1071.0], [77.4, 1075.0], [77.5, 1084.0], [77.6, 1089.0], [77.7, 1094.0], [77.8, 1104.0], [77.9, 1109.0], [78.0, 1111.0], [78.1, 1116.0], [78.2, 1119.0], [78.3, 1119.0], [78.4, 1120.0], [78.5, 1124.0], [78.6, 1125.0], [78.7, 1128.0], [78.8, 1129.0], [78.9, 1130.0], [79.0, 1132.0], [79.1, 1132.0], [79.2, 1133.0], [79.3, 1140.0], [79.4, 1142.0], [79.5, 1142.0], [79.6, 1150.0], [79.7, 1150.0], [79.8, 1151.0], [79.9, 1151.0], [80.0, 1153.0], [80.1, 1154.0], [80.2, 1155.0], [80.3, 1160.0], [80.4, 1162.0], [80.5, 1163.0], [80.6, 1169.0], [80.7, 1170.0], [80.8, 1170.0], [80.9, 1171.0], [81.0, 1173.0], [81.1, 1175.0], [81.2, 1175.0], [81.3, 1178.0], [81.4, 1179.0], [81.5, 1179.0], [81.6, 1181.0], [81.7, 1181.0], [81.8, 1182.0], [81.9, 1182.0], [82.0, 1182.0], [82.1, 1183.0], [82.2, 1183.0], [82.3, 1184.0], [82.4, 1185.0], [82.5, 1185.0], [82.6, 1186.0], [82.7, 1186.0], [82.8, 1186.0], [82.9, 1187.0], [83.0, 1187.0], [83.1, 1189.0], [83.2, 1190.0], [83.3, 1191.0], [83.4, 1191.0], [83.5, 1191.0], [83.6, 1193.0], [83.7, 1197.0], [83.8, 1198.0], [83.9, 1198.0], [84.0, 1201.0], [84.1, 1205.0], [84.2, 1205.0], [84.3, 1205.0], [84.4, 1212.0], [84.5, 1213.0], [84.6, 1213.0], [84.7, 1215.0], [84.8, 1215.0], [84.9, 1222.0], [85.0, 1222.0], [85.1, 1224.0], [85.2, 1227.0], [85.3, 1230.0], [85.4, 1236.0], [85.5, 1238.0], [85.6, 1245.0], [85.7, 1253.0], [85.8, 1256.0], [85.9, 1257.0], [86.0, 1260.0], [86.1, 1263.0], [86.2, 1266.0], [86.3, 1267.0], [86.4, 1267.0], [86.5, 1273.0], [86.6, 1281.0], [86.7, 1302.0], [86.8, 1315.0], [86.9, 1317.0], [87.0, 1319.0], [87.1, 1320.0], [87.2, 1322.0], [87.3, 1324.0], [87.4, 1329.0], [87.5, 1334.0], [87.6, 1336.0], [87.7, 1339.0], [87.8, 1340.0], [87.9, 1342.0], [88.0, 1346.0], [88.1, 1352.0], [88.2, 1369.0], [88.3, 1375.0], [88.4, 1377.0], [88.5, 1384.0], [88.6, 1387.0], [88.7, 1394.0], [88.8, 1398.0], [88.9, 1403.0], [89.0, 1404.0], [89.1, 1409.0], [89.2, 1410.0], [89.3, 1415.0], [89.4, 1417.0], [89.5, 1419.0], [89.6, 1425.0], [89.7, 1428.0], [89.8, 1431.0], [89.9, 1434.0], [90.0, 1438.0], [90.1, 1439.0], [90.2, 1439.0], [90.3, 1445.0], [90.4, 1452.0], [90.5, 1465.0], [90.6, 1466.0], [90.7, 1470.0], [90.8, 1476.0], [90.9, 1478.0], [91.0, 1489.0], [91.1, 1490.0], [91.2, 1490.0], [91.3, 1491.0], [91.4, 1491.0], [91.5, 1492.0], [91.6, 1495.0], [91.7, 1496.0], [91.8, 1497.0], [91.9, 1501.0], [92.0, 1504.0], [92.1, 1510.0], [92.2, 1511.0], [92.3, 1513.0], [92.4, 1523.0], [92.5, 1526.0], [92.6, 1530.0], [92.7, 1536.0], [92.8, 1562.0], [92.9, 1574.0], [93.0, 1584.0], [93.1, 1585.0], [93.2, 1593.0], [93.3, 1594.0], [93.4, 1594.0], [93.5, 1595.0], [93.6, 1599.0], [93.7, 1599.0], [93.8, 1606.0], [93.9, 1607.0], [94.0, 1608.0], [94.1, 1612.0], [94.2, 1629.0], [94.3, 1642.0], [94.4, 1659.0], [94.5, 1666.0], [94.6, 1671.0], [94.7, 1682.0], [94.8, 1682.0], [94.9, 1683.0], [95.0, 1693.0], [95.1, 1709.0], [95.2, 1728.0], [95.3, 1729.0], [95.4, 1734.0], [95.5, 1737.0], [95.6, 1744.0], [95.7, 1751.0], [95.8, 1755.0], [95.9, 1756.0], [96.0, 1757.0], [96.1, 1763.0], [96.2, 1769.0], [96.3, 1775.0], [96.4, 1785.0], [96.5, 1786.0], [96.6, 1788.0], [96.7, 1799.0], [96.8, 1824.0], [96.9, 1834.0], [97.0, 1836.0], [97.1, 1853.0], [97.2, 1860.0], [97.3, 1864.0], [97.4, 1874.0], [97.5, 1914.0], [97.6, 1921.0], [97.7, 1927.0], [97.8, 1934.0], [97.9, 1936.0], [98.0, 1950.0], [98.1, 1954.0], [98.2, 1958.0], [98.3, 1962.0], [98.4, 1973.0], [98.5, 1990.0], [98.6, 1995.0], [98.7, 2014.0], [98.8, 2029.0], [98.9, 2037.0], [99.0, 2041.0], [99.1, 2109.0], [99.2, 2113.0], [99.3, 2115.0], [99.4, 2120.0], [99.5, 2143.0], [99.6, 2143.0], [99.7, 2144.0], [99.8, 2179.0], [99.9, 2202.0]], "isOverall": false, "label": "/tx/save/", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 258.0, "series": [{"data": [[0.0, 1.0], [2100.0, 8.0], [2200.0, 1.0], [600.0, 51.0], [700.0, 61.0], [200.0, 28.0], [800.0, 105.0], [900.0, 64.0], [1000.0, 10.0], [1100.0, 62.0], [300.0, 53.0], [1200.0, 27.0], [1300.0, 22.0], [1400.0, 30.0], [1500.0, 19.0], [100.0, 24.0], [400.0, 123.0], [1600.0, 13.0], [1700.0, 17.0], [1800.0, 7.0], [1900.0, 12.0], [500.0, 258.0], [2000.0, 4.0]], "isOverall": false, "label": "/tx/save/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 2200.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 81.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 690.0, "series": [{"data": [[1.0, 690.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 229.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 81.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 356.26599999999985, "minX": 1.58228274E12, "maxY": 356.26599999999985, "series": [{"data": [[1.58228274E12, 356.26599999999985]], "isOverall": false, "label": "/tx/save/", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.58228274E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 107.5, "minX": 1.0, "maxY": 2202.0, "series": [{"data": [[2.0, 1071.0], [4.0, 835.5], [5.0, 834.0], [7.0, 834.0], [10.0, 914.0], [13.0, 829.0], [15.0, 829.0], [18.0, 827.6666666666666], [19.0, 824.0], [21.0, 823.5], [23.0, 948.0], [24.0, 2202.0], [26.0, 952.5], [28.0, 813.5], [29.0, 813.0], [31.0, 813.0], [33.0, 809.0], [32.0, 2120.0], [37.0, 1124.0], [36.0, 1008.3333333333334], [39.0, 804.0], [38.0, 1094.0], [41.0, 802.0], [45.0, 1934.0], [44.0, 2017.0], [46.0, 796.0], [49.0, 1011.3333333333334], [50.0, 793.0], [53.0, 789.0], [52.0, 791.0], [54.0, 788.0], [57.0, 1229.0], [58.0, 784.0], [60.0, 973.0], [62.0, 782.0], [67.0, 777.0], [66.0, 779.0], [65.0, 910.3333333333334], [70.0, 776.0], [68.0, 1175.0], [75.0, 770.0], [74.0, 773.0], [73.0, 1269.3333333333333], [79.0, 1457.0], [77.0, 2144.0], [76.0, 774.0], [82.0, 773.5], [80.0, 2143.0], [86.0, 1428.0], [85.0, 1954.0], [84.0, 1365.5], [91.0, 775.0], [90.0, 1183.0], [89.0, 1535.6666666666667], [92.0, 775.0], [99.0, 776.0], [98.0, 1032.6666666666667], [101.0, 1193.0], [100.0, 775.0], [107.0, 1190.0], [106.0, 772.0], [105.0, 1317.25], [109.0, 1186.0], [108.0, 1187.0], [114.0, 1511.0], [113.0, 1416.5], [118.0, 1181.0], [117.0, 1182.3333333333333], [123.0, 1179.0], [122.0, 1146.5], [126.0, 1729.0], [125.0, 991.5], [135.0, 1154.0], [134.0, 1155.0], [133.0, 1490.0], [132.0, 1160.0], [131.0, 1162.0], [130.0, 1170.0], [129.0, 1173.0], [128.0, 986.0], [142.0, 1142.0], [141.0, 783.0], [140.0, 788.0], [139.0, 1150.0], [138.0, 1151.0], [137.0, 1150.0], [136.0, 1153.0], [151.0, 1133.0], [150.0, 1304.0], [148.0, 810.0], [147.0, 917.0], [144.0, 977.5], [159.0, 1290.0], [156.0, 1268.4], [165.0, 2029.0], [164.0, 1063.4], [169.0, 161.0], [174.0, 831.0], [173.0, 2014.0], [172.0, 1682.0], [171.0, 985.5], [183.0, 1744.0], [182.0, 901.0], [181.0, 1116.0], [180.0, 872.0], [179.0, 1204.4], [191.0, 845.0], [190.0, 1253.5], [188.0, 840.0], [187.0, 1183.0], [184.0, 836.0], [199.0, 107.5], [198.0, 838.0], [197.0, 1995.0], [196.0, 957.6666666666666], [193.0, 1952.0], [203.0, 208.0], [207.0, 1751.0], [206.0, 834.0], [205.0, 832.0], [204.0, 930.3333333333333], [213.0, 486.0], [214.0, 592.0], [212.0, 1262.4], [222.0, 864.5], [220.0, 863.0], [219.0, 1191.0], [218.0, 1860.0], [217.0, 1005.6666666666666], [225.0, 147.0], [231.0, 899.0], [230.0, 577.0], [229.0, 895.5], [227.0, 1958.0], [226.0, 1031.25], [239.0, 568.5], [237.0, 570.0], [236.0, 571.0], [235.0, 573.0], [234.0, 574.0], [233.0, 574.5], [247.0, 931.0], [246.0, 1864.0], [245.0, 1359.5], [243.0, 918.0], [242.0, 904.0], [241.0, 902.0], [240.0, 911.0], [254.0, 940.0], [253.0, 1063.5], [251.0, 940.0], [250.0, 1936.0], [249.0, 1079.0], [268.0, 539.0], [270.0, 1834.0], [271.0, 536.0], [269.0, 1263.0], [266.0, 1148.5], [264.0, 1775.0], [263.0, 946.0], [258.0, 937.0], [257.0, 812.0], [262.0, 1432.0], [260.0, 1165.5], [286.0, 956.0], [287.0, 957.0], [285.0, 537.0], [284.0, 748.0], [282.0, 1215.0], [281.0, 539.0], [280.0, 967.0], [279.0, 547.0], [272.0, 536.0], [274.0, 1728.0], [273.0, 1799.0], [278.0, 542.0], [277.0, 542.0], [276.0, 755.5], [303.0, 525.0], [302.0, 519.0], [291.0, 952.0], [289.0, 534.0], [288.0, 535.0], [299.0, 942.0], [298.0, 939.0], [297.0, 588.0], [296.0, 940.0], [295.0, 526.0], [294.0, 526.0], [293.0, 529.0], [292.0, 741.0], [318.0, 532.0], [319.0, 532.0], [316.0, 536.0], [307.0, 545.0], [306.0, 525.0], [305.0, 551.0], [304.0, 531.0], [315.0, 1584.0], [314.0, 913.0], [313.0, 536.0], [312.0, 544.0], [311.0, 546.0], [310.0, 542.0], [309.0, 548.0], [334.0, 537.0], [335.0, 511.0], [332.0, 1607.0], [323.0, 530.0], [322.0, 537.0], [321.0, 527.0], [320.0, 538.0], [331.0, 697.5], [329.0, 526.0], [328.0, 515.0], [327.0, 527.5], [325.0, 517.0], [324.0, 519.0], [349.0, 1222.0], [351.0, 840.0], [346.0, 1048.0], [350.0, 527.0], [348.0, 531.0], [339.0, 530.0], [338.0, 863.0], [337.0, 1595.0], [336.0, 1215.0], [347.0, 1756.0], [345.0, 633.6666666666666], [342.0, 531.0], [341.0, 532.0], [340.0, 859.0], [366.0, 1510.0], [367.0, 1709.0], [365.0, 594.0], [364.0, 822.0], [363.0, 523.0], [362.0, 535.0], [361.0, 524.0], [360.0, 676.0], [358.0, 828.0], [353.0, 525.0], [352.0, 526.0], [355.0, 1734.0], [354.0, 1445.0], [357.0, 525.0], [356.0, 525.0], [383.0, 489.29999999999995], [379.0, 307.22222222222223], [378.0, 392.2727272727273], [376.0, 442.5], [381.0, 240.46153846153845], [382.0, 318.6363636363636], [377.0, 518.2857142857142], [380.0, 430.1111111111111], [371.0, 546.0], [370.0, 554.0], [368.0, 794.0], [375.0, 612.0], [373.0, 524.0], [372.0, 1683.0], [386.0, 495.0], [384.0, 369.0], [387.0, 450.5], [385.0, 687.75], [399.0, 449.0], [397.0, 1120.5], [395.0, 1011.0], [392.0, 1147.3333333333333], [389.0, 510.0], [388.0, 515.0], [415.0, 671.1428571428571], [414.0, 606.1428571428571], [412.0, 379.3333333333333], [403.0, 572.3333333333334], [402.0, 530.3333333333334], [401.0, 507.14285714285717], [400.0, 1088.6666666666667], [413.0, 501.375], [411.0, 836.75], [409.0, 812.6666666666666], [410.0, 497.1666666666667], [407.0, 593.8461538461537], [405.0, 495.3333333333333], [406.0, 535.0], [404.0, 448.0], [408.0, 442.0], [423.0, 535.4285714285714], [419.0, 465.1818181818182], [431.0, 1612.0], [430.0, 990.6666666666667], [421.0, 453.6666666666667], [420.0, 363.5], [425.0, 474.5], [427.0, 667.3333333333334], [424.0, 419.4166666666667], [422.0, 725.0], [418.0, 458.2857142857143], [417.0, 718.75], [416.0, 539.25], [446.0, 1593.5], [447.0, 1224.0], [444.0, 873.0], [435.0, 841.0], [434.0, 869.5], [432.0, 1608.0], [443.0, 604.0], [442.0, 599.5], [440.0, 599.0], [439.0, 1513.0], [438.0, 977.5], [437.0, 575.0], [451.0, 1334.0], [462.0, 643.0], [463.0, 640.0], [461.0, 919.5], [450.0, 609.0], [449.0, 1478.0], [448.0, 1222.0], [459.0, 613.0], [458.0, 909.3333333333334], [455.0, 1585.0], [454.0, 872.0], [453.0, 611.0], [452.0, 1245.0], [478.0, 627.25], [479.0, 774.0], [476.0, 891.0], [477.0, 897.0], [475.0, 855.25], [473.0, 622.0], [472.0, 625.0], [471.0, 628.0], [465.0, 1087.0], [467.0, 1369.0], [466.0, 637.0], [470.0, 631.0], [468.0, 632.0], [492.0, 651.1666666666667], [494.0, 480.6], [495.0, 898.3333333333333], [493.0, 566.5624999999999], [490.0, 746.6666666666667], [491.0, 921.0], [489.0, 1196.5], [488.0, 868.75], [487.0, 697.125], [481.0, 846.75], [480.0, 714.6666666666666], [483.0, 686.5], [482.0, 899.6666666666666], [486.0, 617.2], [484.0, 685.5714285714286], [485.0, 1000.5], [498.0, 474.0], [506.0, 641.0], [505.0, 934.6], [507.0, 798.05], [504.0, 691.6666666666666], [503.0, 753.2], [502.0, 877.3333333333333], [501.0, 478.0], [500.0, 612.3333333333334], [499.0, 1013.6666666666666], [508.0, 806.25], [509.0, 704.0], [510.0, 583.2], [511.0, 870.1428571428571], [497.0, 865.5], [496.0, 544.5], [519.0, 863.6666666666667], [512.0, 702.6666666666666], [513.0, 849.7142857142857], [515.0, 563.5], [514.0, 915.0], [521.0, 990.5], [520.0, 544.5], [524.0, 921.5], [526.0, 550.0], [527.0, 667.8333333333334], [523.0, 788.0], [522.0, 917.0], [531.0, 740.0], [532.0, 1051.4], [535.0, 897.0], [534.0, 1419.0], [533.0, 911.0], [530.0, 542.4], [529.0, 682.6666666666666], [528.0, 599.0], [543.0, 683.3333333333334], [540.0, 560.0], [539.0, 917.0], [538.0, 565.5], [536.0, 566.0], [516.0, 552.0], [517.0, 552.0], [518.0, 1031.6666666666667], [573.0, 1169.0], [557.0, 661.0], [556.0, 542.0], [555.0, 1387.0], [554.0, 800.3333333333334], [553.0, 550.0], [558.0, 1248.0], [566.0, 665.0], [565.0, 532.0], [564.0, 1257.0], [563.0, 534.0], [562.0, 763.5], [561.0, 939.0], [567.0, 749.5], [575.0, 1201.0], [574.0, 543.0], [572.0, 742.0], [570.0, 944.0], [569.0, 545.0], [568.0, 530.0], [550.0, 827.5], [548.0, 553.0], [547.0, 556.0], [546.0, 557.0], [545.0, 1340.0], [577.0, 622.5], [587.0, 927.0], [583.0, 539.0], [582.0, 1236.0], [581.0, 1404.0], [580.0, 543.5], [578.0, 544.0], [576.0, 545.0], [1.0, 2179.0]], "isOverall": false, "label": "/tx/save/", "isController": false}, {"data": [[356.2639999999993, 788.5050000000003]], "isOverall": false, "label": "/tx/save/-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 587.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 2100.0, "minX": 1.58228274E12, "maxY": 2366.6666666666665, "series": [{"data": [[1.58228274E12, 2366.6666666666665]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.58228274E12, 2100.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.58228274E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 788.5050000000003, "minX": 1.58228274E12, "maxY": 788.5050000000003, "series": [{"data": [[1.58228274E12, 788.5050000000003]], "isOverall": false, "label": "/tx/save/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.58228274E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 788.2859999999996, "minX": 1.58228274E12, "maxY": 788.2859999999996, "series": [{"data": [[1.58228274E12, 788.2859999999996]], "isOverall": false, "label": "/tx/save/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.58228274E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 14.284999999999998, "minX": 1.58228274E12, "maxY": 14.284999999999998, "series": [{"data": [[1.58228274E12, 14.284999999999998]], "isOverall": false, "label": "/tx/save/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.58228274E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 99.0, "minX": 1.58228274E12, "maxY": 2202.0, "series": [{"data": [[1.58228274E12, 2202.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.58228274E12, 99.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.58228274E12, 1437.6]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.58228274E12, 2040.96]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.58228274E12, 1692.4999999999993]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.58228274E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 611.5, "minX": 16.0, "maxY": 611.5, "series": [{"data": [[16.0, 611.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 611.5, "minX": 16.0, "maxY": 611.5, "series": [{"data": [[16.0, 611.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.58228274E12, "maxY": 16.666666666666668, "series": [{"data": [[1.58228274E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.58228274E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.58228274E12, "maxY": 16.666666666666668, "series": [{"data": [[1.58228274E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.58228274E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.58228274E12, "maxY": 16.666666666666668, "series": [{"data": [[1.58228274E12, 16.666666666666668]], "isOverall": false, "label": "/tx/save/-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.58228274E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
