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
        data: {"result": {"minY": 544.0, "minX": 0.0, "maxY": 5387.0, "series": [{"data": [[0.0, 544.0], [0.1, 597.0], [0.2, 687.0], [0.3, 687.0], [0.4, 716.0], [0.5, 732.0], [0.6, 741.0], [0.7, 751.0], [0.8, 755.0], [0.9, 784.0], [1.0, 792.0], [1.1, 793.0], [1.2, 797.0], [1.3, 800.0], [1.4, 800.0], [1.5, 801.0], [1.6, 802.0], [1.7, 802.0], [1.8, 806.0], [1.9, 812.0], [2.0, 837.0], [2.1, 848.0], [2.2, 863.0], [2.3, 882.0], [2.4, 883.0], [2.5, 891.0], [2.6, 892.0], [2.7, 895.0], [2.8, 909.0], [2.9, 937.0], [3.0, 940.0], [3.1, 942.0], [3.2, 945.0], [3.3, 950.0], [3.4, 950.0], [3.5, 951.0], [3.6, 955.0], [3.7, 968.0], [3.8, 972.0], [3.9, 974.0], [4.0, 985.0], [4.1, 990.0], [4.2, 1063.0], [4.3, 1064.0], [4.4, 1082.0], [4.5, 1086.0], [4.6, 1115.0], [4.7, 1118.0], [4.8, 1128.0], [4.9, 1128.0], [5.0, 1129.0], [5.1, 1146.0], [5.2, 1182.0], [5.3, 1189.0], [5.4, 1207.0], [5.5, 1209.0], [5.6, 1235.0], [5.7, 1238.0], [5.8, 1246.0], [5.9, 1249.0], [6.0, 1249.0], [6.1, 1278.0], [6.2, 1281.0], [6.3, 1352.0], [6.4, 1380.0], [6.5, 1395.0], [6.6, 1401.0], [6.7, 1406.0], [6.8, 1419.0], [6.9, 1434.0], [7.0, 1448.0], [7.1, 1448.0], [7.2, 1463.0], [7.3, 1471.0], [7.4, 1473.0], [7.5, 1478.0], [7.6, 1480.0], [7.7, 1481.0], [7.8, 1486.0], [7.9, 1502.0], [8.0, 1510.0], [8.1, 1519.0], [8.2, 1520.0], [8.3, 1524.0], [8.4, 1527.0], [8.5, 1530.0], [8.6, 1547.0], [8.7, 1572.0], [8.8, 1580.0], [8.9, 1585.0], [9.0, 1588.0], [9.1, 1601.0], [9.2, 1612.0], [9.3, 1620.0], [9.4, 1625.0], [9.5, 1625.0], [9.6, 1631.0], [9.7, 1637.0], [9.8, 1644.0], [9.9, 1647.0], [10.0, 1649.0], [10.1, 1654.0], [10.2, 1656.0], [10.3, 1660.0], [10.4, 1683.0], [10.5, 1690.0], [10.6, 1693.0], [10.7, 1699.0], [10.8, 1699.0], [10.9, 1701.0], [11.0, 1702.0], [11.1, 1705.0], [11.2, 1724.0], [11.3, 1728.0], [11.4, 1731.0], [11.5, 1733.0], [11.6, 1735.0], [11.7, 1740.0], [11.8, 1744.0], [11.9, 1747.0], [12.0, 1748.0], [12.1, 1764.0], [12.2, 1764.0], [12.3, 1766.0], [12.4, 1767.0], [12.5, 1767.0], [12.6, 1772.0], [12.7, 1776.0], [12.8, 1784.0], [12.9, 1791.0], [13.0, 1792.0], [13.1, 1795.0], [13.2, 1795.0], [13.3, 1802.0], [13.4, 1804.0], [13.5, 1806.0], [13.6, 1808.0], [13.7, 1816.0], [13.8, 1816.0], [13.9, 1823.0], [14.0, 1825.0], [14.1, 1836.0], [14.2, 1849.0], [14.3, 1853.0], [14.4, 1857.0], [14.5, 1863.0], [14.6, 1865.0], [14.7, 1866.0], [14.8, 1871.0], [14.9, 1871.0], [15.0, 1872.0], [15.1, 1876.0], [15.2, 1878.0], [15.3, 1879.0], [15.4, 1881.0], [15.5, 1883.0], [15.6, 1884.0], [15.7, 1885.0], [15.8, 1888.0], [15.9, 1888.0], [16.0, 1893.0], [16.1, 1898.0], [16.2, 1899.0], [16.3, 1903.0], [16.4, 1903.0], [16.5, 1904.0], [16.6, 1905.0], [16.7, 1910.0], [16.8, 1913.0], [16.9, 1917.0], [17.0, 1920.0], [17.1, 1932.0], [17.2, 1937.0], [17.3, 1938.0], [17.4, 1949.0], [17.5, 1966.0], [17.6, 1975.0], [17.7, 1980.0], [17.8, 1987.0], [17.9, 1990.0], [18.0, 1990.0], [18.1, 1991.0], [18.2, 2013.0], [18.3, 2014.0], [18.4, 2015.0], [18.5, 2032.0], [18.6, 2043.0], [18.7, 2048.0], [18.8, 2050.0], [18.9, 2052.0], [19.0, 2056.0], [19.1, 2065.0], [19.2, 2070.0], [19.3, 2078.0], [19.4, 2078.0], [19.5, 2079.0], [19.6, 2083.0], [19.7, 2085.0], [19.8, 2088.0], [19.9, 2091.0], [20.0, 2096.0], [20.1, 2096.0], [20.2, 2098.0], [20.3, 2102.0], [20.4, 2103.0], [20.5, 2111.0], [20.6, 2113.0], [20.7, 2114.0], [20.8, 2120.0], [20.9, 2120.0], [21.0, 2122.0], [21.1, 2124.0], [21.2, 2124.0], [21.3, 2133.0], [21.4, 2136.0], [21.5, 2138.0], [21.6, 2139.0], [21.7, 2143.0], [21.8, 2148.0], [21.9, 2153.0], [22.0, 2156.0], [22.1, 2158.0], [22.2, 2159.0], [22.3, 2165.0], [22.4, 2166.0], [22.5, 2169.0], [22.6, 2175.0], [22.7, 2177.0], [22.8, 2183.0], [22.9, 2189.0], [23.0, 2192.0], [23.1, 2196.0], [23.2, 2202.0], [23.3, 2204.0], [23.4, 2215.0], [23.5, 2218.0], [23.6, 2218.0], [23.7, 2219.0], [23.8, 2219.0], [23.9, 2220.0], [24.0, 2224.0], [24.1, 2231.0], [24.2, 2234.0], [24.3, 2234.0], [24.4, 2237.0], [24.5, 2242.0], [24.6, 2244.0], [24.7, 2245.0], [24.8, 2247.0], [24.9, 2248.0], [25.0, 2249.0], [25.1, 2252.0], [25.2, 2252.0], [25.3, 2254.0], [25.4, 2262.0], [25.5, 2266.0], [25.6, 2268.0], [25.7, 2269.0], [25.8, 2277.0], [25.9, 2285.0], [26.0, 2292.0], [26.1, 2295.0], [26.2, 2297.0], [26.3, 2300.0], [26.4, 2302.0], [26.5, 2311.0], [26.6, 2320.0], [26.7, 2323.0], [26.8, 2324.0], [26.9, 2326.0], [27.0, 2334.0], [27.1, 2334.0], [27.2, 2339.0], [27.3, 2347.0], [27.4, 2347.0], [27.5, 2351.0], [27.6, 2362.0], [27.7, 2362.0], [27.8, 2363.0], [27.9, 2371.0], [28.0, 2372.0], [28.1, 2374.0], [28.2, 2376.0], [28.3, 2383.0], [28.4, 2390.0], [28.5, 2400.0], [28.6, 2413.0], [28.7, 2417.0], [28.8, 2418.0], [28.9, 2421.0], [29.0, 2423.0], [29.1, 2428.0], [29.2, 2432.0], [29.3, 2448.0], [29.4, 2456.0], [29.5, 2459.0], [29.6, 2461.0], [29.7, 2466.0], [29.8, 2468.0], [29.9, 2477.0], [30.0, 2480.0], [30.1, 2494.0], [30.2, 2500.0], [30.3, 2500.0], [30.4, 2504.0], [30.5, 2506.0], [30.6, 2509.0], [30.7, 2511.0], [30.8, 2528.0], [30.9, 2528.0], [31.0, 2531.0], [31.1, 2537.0], [31.2, 2539.0], [31.3, 2546.0], [31.4, 2547.0], [31.5, 2571.0], [31.6, 2572.0], [31.7, 2574.0], [31.8, 2574.0], [31.9, 2574.0], [32.0, 2584.0], [32.1, 2589.0], [32.2, 2591.0], [32.3, 2596.0], [32.4, 2598.0], [32.5, 2605.0], [32.6, 2615.0], [32.7, 2616.0], [32.8, 2619.0], [32.9, 2619.0], [33.0, 2622.0], [33.1, 2630.0], [33.2, 2630.0], [33.3, 2631.0], [33.4, 2635.0], [33.5, 2637.0], [33.6, 2645.0], [33.7, 2645.0], [33.8, 2650.0], [33.9, 2664.0], [34.0, 2676.0], [34.1, 2687.0], [34.2, 2701.0], [34.3, 2708.0], [34.4, 2721.0], [34.5, 2741.0], [34.6, 2747.0], [34.7, 2748.0], [34.8, 2772.0], [34.9, 2775.0], [35.0, 2800.0], [35.1, 2803.0], [35.2, 2829.0], [35.3, 2855.0], [35.4, 2864.0], [35.5, 2868.0], [35.6, 2895.0], [35.7, 2896.0], [35.8, 2899.0], [35.9, 2904.0], [36.0, 2924.0], [36.1, 2925.0], [36.2, 2927.0], [36.3, 2935.0], [36.4, 2935.0], [36.5, 2944.0], [36.6, 2953.0], [36.7, 2953.0], [36.8, 2954.0], [36.9, 2960.0], [37.0, 2961.0], [37.1, 2961.0], [37.2, 2963.0], [37.3, 2967.0], [37.4, 2981.0], [37.5, 2997.0], [37.6, 3008.0], [37.7, 3012.0], [37.8, 3027.0], [37.9, 3032.0], [38.0, 3035.0], [38.1, 3036.0], [38.2, 3037.0], [38.3, 3039.0], [38.4, 3065.0], [38.5, 3075.0], [38.6, 3076.0], [38.7, 3087.0], [38.8, 3087.0], [38.9, 3097.0], [39.0, 3098.0], [39.1, 3099.0], [39.2, 3107.0], [39.3, 3109.0], [39.4, 3111.0], [39.5, 3118.0], [39.6, 3124.0], [39.7, 3133.0], [39.8, 3139.0], [39.9, 3140.0], [40.0, 3143.0], [40.1, 3146.0], [40.2, 3146.0], [40.3, 3169.0], [40.4, 3170.0], [40.5, 3171.0], [40.6, 3176.0], [40.7, 3177.0], [40.8, 3190.0], [40.9, 3195.0], [41.0, 3197.0], [41.1, 3204.0], [41.2, 3205.0], [41.3, 3206.0], [41.4, 3208.0], [41.5, 3208.0], [41.6, 3212.0], [41.7, 3222.0], [41.8, 3224.0], [41.9, 3228.0], [42.0, 3228.0], [42.1, 3230.0], [42.2, 3232.0], [42.3, 3241.0], [42.4, 3241.0], [42.5, 3241.0], [42.6, 3250.0], [42.7, 3252.0], [42.8, 3266.0], [42.9, 3268.0], [43.0, 3268.0], [43.1, 3269.0], [43.2, 3269.0], [43.3, 3272.0], [43.4, 3272.0], [43.5, 3272.0], [43.6, 3274.0], [43.7, 3279.0], [43.8, 3281.0], [43.9, 3281.0], [44.0, 3282.0], [44.1, 3291.0], [44.2, 3294.0], [44.3, 3295.0], [44.4, 3296.0], [44.5, 3298.0], [44.6, 3301.0], [44.7, 3301.0], [44.8, 3305.0], [44.9, 3306.0], [45.0, 3306.0], [45.1, 3307.0], [45.2, 3308.0], [45.3, 3308.0], [45.4, 3314.0], [45.5, 3314.0], [45.6, 3317.0], [45.7, 3319.0], [45.8, 3321.0], [45.9, 3322.0], [46.0, 3325.0], [46.1, 3326.0], [46.2, 3332.0], [46.3, 3334.0], [46.4, 3336.0], [46.5, 3337.0], [46.6, 3342.0], [46.7, 3348.0], [46.8, 3349.0], [46.9, 3351.0], [47.0, 3352.0], [47.1, 3358.0], [47.2, 3359.0], [47.3, 3363.0], [47.4, 3368.0], [47.5, 3368.0], [47.6, 3370.0], [47.7, 3374.0], [47.8, 3375.0], [47.9, 3378.0], [48.0, 3381.0], [48.1, 3382.0], [48.2, 3383.0], [48.3, 3383.0], [48.4, 3383.0], [48.5, 3390.0], [48.6, 3394.0], [48.7, 3399.0], [48.8, 3413.0], [48.9, 3413.0], [49.0, 3425.0], [49.1, 3428.0], [49.2, 3429.0], [49.3, 3431.0], [49.4, 3442.0], [49.5, 3452.0], [49.6, 3457.0], [49.7, 3457.0], [49.8, 3462.0], [49.9, 3470.0], [50.0, 3471.0], [50.1, 3488.0], [50.2, 3495.0], [50.3, 3496.0], [50.4, 3500.0], [50.5, 3507.0], [50.6, 3508.0], [50.7, 3511.0], [50.8, 3513.0], [50.9, 3517.0], [51.0, 3528.0], [51.1, 3536.0], [51.2, 3537.0], [51.3, 3540.0], [51.4, 3543.0], [51.5, 3552.0], [51.6, 3556.0], [51.7, 3557.0], [51.8, 3560.0], [51.9, 3565.0], [52.0, 3579.0], [52.1, 3587.0], [52.2, 3588.0], [52.3, 3588.0], [52.4, 3605.0], [52.5, 3608.0], [52.6, 3617.0], [52.7, 3620.0], [52.8, 3620.0], [52.9, 3630.0], [53.0, 3642.0], [53.1, 3655.0], [53.2, 3661.0], [53.3, 3664.0], [53.4, 3670.0], [53.5, 3671.0], [53.6, 3681.0], [53.7, 3683.0], [53.8, 3695.0], [53.9, 3699.0], [54.0, 3704.0], [54.1, 3719.0], [54.2, 3722.0], [54.3, 3726.0], [54.4, 3726.0], [54.5, 3732.0], [54.6, 3740.0], [54.7, 3746.0], [54.8, 3747.0], [54.9, 3748.0], [55.0, 3750.0], [55.1, 3766.0], [55.2, 3769.0], [55.3, 3769.0], [55.4, 3776.0], [55.5, 3777.0], [55.6, 3781.0], [55.7, 3781.0], [55.8, 3781.0], [55.9, 3782.0], [56.0, 3783.0], [56.1, 3784.0], [56.2, 3788.0], [56.3, 3790.0], [56.4, 3792.0], [56.5, 3810.0], [56.6, 3818.0], [56.7, 3837.0], [56.8, 3849.0], [56.9, 3852.0], [57.0, 3860.0], [57.1, 3865.0], [57.2, 3866.0], [57.3, 3867.0], [57.4, 3873.0], [57.5, 3873.0], [57.6, 3874.0], [57.7, 3879.0], [57.8, 3887.0], [57.9, 3911.0], [58.0, 3922.0], [58.1, 3928.0], [58.2, 3928.0], [58.3, 3930.0], [58.4, 3943.0], [58.5, 3954.0], [58.6, 3957.0], [58.7, 3965.0], [58.8, 3971.0], [58.9, 3976.0], [59.0, 3990.0], [59.1, 3994.0], [59.2, 4004.0], [59.3, 4005.0], [59.4, 4006.0], [59.5, 4008.0], [59.6, 4010.0], [59.7, 4015.0], [59.8, 4016.0], [59.9, 4018.0], [60.0, 4019.0], [60.1, 4022.0], [60.2, 4024.0], [60.3, 4031.0], [60.4, 4033.0], [60.5, 4048.0], [60.6, 4055.0], [60.7, 4055.0], [60.8, 4070.0], [60.9, 4074.0], [61.0, 4079.0], [61.1, 4082.0], [61.2, 4085.0], [61.3, 4090.0], [61.4, 4091.0], [61.5, 4094.0], [61.6, 4095.0], [61.7, 4100.0], [61.8, 4100.0], [61.9, 4101.0], [62.0, 4109.0], [62.1, 4117.0], [62.2, 4117.0], [62.3, 4117.0], [62.4, 4121.0], [62.5, 4121.0], [62.6, 4121.0], [62.7, 4121.0], [62.8, 4123.0], [62.9, 4124.0], [63.0, 4124.0], [63.1, 4128.0], [63.2, 4136.0], [63.3, 4137.0], [63.4, 4138.0], [63.5, 4139.0], [63.6, 4139.0], [63.7, 4141.0], [63.8, 4154.0], [63.9, 4158.0], [64.0, 4166.0], [64.1, 4170.0], [64.2, 4170.0], [64.3, 4180.0], [64.4, 4184.0], [64.5, 4187.0], [64.6, 4188.0], [64.7, 4190.0], [64.8, 4193.0], [64.9, 4193.0], [65.0, 4208.0], [65.1, 4223.0], [65.2, 4231.0], [65.3, 4235.0], [65.4, 4237.0], [65.5, 4239.0], [65.6, 4240.0], [65.7, 4244.0], [65.8, 4262.0], [65.9, 4263.0], [66.0, 4265.0], [66.1, 4274.0], [66.2, 4278.0], [66.3, 4284.0], [66.4, 4288.0], [66.5, 4290.0], [66.6, 4295.0], [66.7, 4296.0], [66.8, 4300.0], [66.9, 4300.0], [67.0, 4310.0], [67.1, 4323.0], [67.2, 4326.0], [67.3, 4326.0], [67.4, 4340.0], [67.5, 4355.0], [67.6, 4356.0], [67.7, 4363.0], [67.8, 4363.0], [67.9, 4363.0], [68.0, 4364.0], [68.1, 4364.0], [68.2, 4366.0], [68.3, 4373.0], [68.4, 4403.0], [68.5, 4412.0], [68.6, 4422.0], [68.7, 4431.0], [68.8, 4433.0], [68.9, 4434.0], [69.0, 4438.0], [69.1, 4438.0], [69.2, 4439.0], [69.3, 4439.0], [69.4, 4441.0], [69.5, 4454.0], [69.6, 4456.0], [69.7, 4462.0], [69.8, 4468.0], [69.9, 4474.0], [70.0, 4474.0], [70.1, 4479.0], [70.2, 4480.0], [70.3, 4481.0], [70.4, 4483.0], [70.5, 4484.0], [70.6, 4490.0], [70.7, 4504.0], [70.8, 4505.0], [70.9, 4507.0], [71.0, 4507.0], [71.1, 4514.0], [71.2, 4517.0], [71.3, 4518.0], [71.4, 4519.0], [71.5, 4520.0], [71.6, 4536.0], [71.7, 4538.0], [71.8, 4540.0], [71.9, 4541.0], [72.0, 4543.0], [72.1, 4545.0], [72.2, 4548.0], [72.3, 4551.0], [72.4, 4554.0], [72.5, 4555.0], [72.6, 4557.0], [72.7, 4563.0], [72.8, 4565.0], [72.9, 4567.0], [73.0, 4574.0], [73.1, 4575.0], [73.2, 4576.0], [73.3, 4578.0], [73.4, 4582.0], [73.5, 4591.0], [73.6, 4596.0], [73.7, 4598.0], [73.8, 4606.0], [73.9, 4607.0], [74.0, 4611.0], [74.1, 4614.0], [74.2, 4625.0], [74.3, 4631.0], [74.4, 4635.0], [74.5, 4636.0], [74.6, 4639.0], [74.7, 4640.0], [74.8, 4645.0], [74.9, 4649.0], [75.0, 4655.0], [75.1, 4656.0], [75.2, 4660.0], [75.3, 4661.0], [75.4, 4663.0], [75.5, 4665.0], [75.6, 4670.0], [75.7, 4672.0], [75.8, 4672.0], [75.9, 4672.0], [76.0, 4672.0], [76.1, 4679.0], [76.2, 4680.0], [76.3, 4681.0], [76.4, 4682.0], [76.5, 4682.0], [76.6, 4683.0], [76.7, 4683.0], [76.8, 4684.0], [76.9, 4686.0], [77.0, 4686.0], [77.1, 4686.0], [77.2, 4687.0], [77.3, 4688.0], [77.4, 4690.0], [77.5, 4691.0], [77.6, 4692.0], [77.7, 4694.0], [77.8, 4694.0], [77.9, 4696.0], [78.0, 4696.0], [78.1, 4697.0], [78.2, 4700.0], [78.3, 4701.0], [78.4, 4702.0], [78.5, 4702.0], [78.6, 4703.0], [78.7, 4704.0], [78.8, 4705.0], [78.9, 4707.0], [79.0, 4707.0], [79.1, 4707.0], [79.2, 4709.0], [79.3, 4710.0], [79.4, 4710.0], [79.5, 4713.0], [79.6, 4717.0], [79.7, 4717.0], [79.8, 4717.0], [79.9, 4717.0], [80.0, 4721.0], [80.1, 4725.0], [80.2, 4726.0], [80.3, 4727.0], [80.4, 4727.0], [80.5, 4729.0], [80.6, 4731.0], [80.7, 4732.0], [80.8, 4735.0], [80.9, 4736.0], [81.0, 4739.0], [81.1, 4741.0], [81.2, 4743.0], [81.3, 4744.0], [81.4, 4747.0], [81.5, 4749.0], [81.6, 4752.0], [81.7, 4754.0], [81.8, 4757.0], [81.9, 4759.0], [82.0, 4759.0], [82.1, 4761.0], [82.2, 4762.0], [82.3, 4762.0], [82.4, 4763.0], [82.5, 4763.0], [82.6, 4766.0], [82.7, 4768.0], [82.8, 4773.0], [82.9, 4775.0], [83.0, 4783.0], [83.1, 4784.0], [83.2, 4786.0], [83.3, 4788.0], [83.4, 4788.0], [83.5, 4790.0], [83.6, 4791.0], [83.7, 4791.0], [83.8, 4791.0], [83.9, 4791.0], [84.0, 4792.0], [84.1, 4792.0], [84.2, 4792.0], [84.3, 4793.0], [84.4, 4793.0], [84.5, 4796.0], [84.6, 4798.0], [84.7, 4798.0], [84.8, 4802.0], [84.9, 4802.0], [85.0, 4805.0], [85.1, 4806.0], [85.2, 4806.0], [85.3, 4806.0], [85.4, 4807.0], [85.5, 4808.0], [85.6, 4808.0], [85.7, 4809.0], [85.8, 4810.0], [85.9, 4812.0], [86.0, 4812.0], [86.1, 4813.0], [86.2, 4815.0], [86.3, 4815.0], [86.4, 4816.0], [86.5, 4817.0], [86.6, 4819.0], [86.7, 4820.0], [86.8, 4822.0], [86.9, 4825.0], [87.0, 4826.0], [87.1, 4826.0], [87.2, 4827.0], [87.3, 4828.0], [87.4, 4829.0], [87.5, 4829.0], [87.6, 4829.0], [87.7, 4830.0], [87.8, 4832.0], [87.9, 4834.0], [88.0, 4834.0], [88.1, 4834.0], [88.2, 4835.0], [88.3, 4838.0], [88.4, 4842.0], [88.5, 4844.0], [88.6, 4844.0], [88.7, 4845.0], [88.8, 4845.0], [88.9, 4846.0], [89.0, 4846.0], [89.1, 4847.0], [89.2, 4849.0], [89.3, 4849.0], [89.4, 4849.0], [89.5, 4851.0], [89.6, 4851.0], [89.7, 4855.0], [89.8, 4856.0], [89.9, 4856.0], [90.0, 4857.0], [90.1, 4860.0], [90.2, 4860.0], [90.3, 4864.0], [90.4, 4865.0], [90.5, 4866.0], [90.6, 4866.0], [90.7, 4866.0], [90.8, 4871.0], [90.9, 4871.0], [91.0, 4872.0], [91.1, 4873.0], [91.2, 4874.0], [91.3, 4874.0], [91.4, 4876.0], [91.5, 4876.0], [91.6, 4877.0], [91.7, 4877.0], [91.8, 4877.0], [91.9, 4878.0], [92.0, 4878.0], [92.1, 4878.0], [92.2, 4881.0], [92.3, 4882.0], [92.4, 4882.0], [92.5, 4883.0], [92.6, 4883.0], [92.7, 4883.0], [92.8, 4883.0], [92.9, 4884.0], [93.0, 4885.0], [93.1, 4887.0], [93.2, 4889.0], [93.3, 4892.0], [93.4, 4893.0], [93.5, 4893.0], [93.6, 4893.0], [93.7, 4896.0], [93.8, 4898.0], [93.9, 4904.0], [94.0, 4910.0], [94.1, 4911.0], [94.2, 4915.0], [94.3, 4916.0], [94.4, 4920.0], [94.5, 4923.0], [94.6, 4924.0], [94.7, 4926.0], [94.8, 4930.0], [94.9, 4933.0], [95.0, 4937.0], [95.1, 4939.0], [95.2, 4940.0], [95.3, 4941.0], [95.4, 4943.0], [95.5, 4944.0], [95.6, 4945.0], [95.7, 4947.0], [95.8, 4951.0], [95.9, 4960.0], [96.0, 4961.0], [96.1, 4964.0], [96.2, 4965.0], [96.3, 4965.0], [96.4, 4965.0], [96.5, 4966.0], [96.6, 4969.0], [96.7, 4973.0], [96.8, 4975.0], [96.9, 4977.0], [97.0, 4980.0], [97.1, 4981.0], [97.2, 4983.0], [97.3, 5002.0], [97.4, 5004.0], [97.5, 5006.0], [97.6, 5010.0], [97.7, 5013.0], [97.8, 5013.0], [97.9, 5018.0], [98.0, 5020.0], [98.1, 5027.0], [98.2, 5039.0], [98.3, 5078.0], [98.4, 5078.0], [98.5, 5111.0], [98.6, 5113.0], [98.7, 5124.0], [98.8, 5142.0], [98.9, 5152.0], [99.0, 5155.0], [99.1, 5164.0], [99.2, 5175.0], [99.3, 5180.0], [99.4, 5185.0], [99.5, 5195.0], [99.6, 5198.0], [99.7, 5218.0], [99.8, 5324.0], [99.9, 5387.0]], "isOverall": false, "label": "/tx-mm/save/", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 500.0, "maxY": 91.0, "series": [{"data": [[600.0, 1.0], [700.0, 10.0], [800.0, 14.0], [900.0, 14.0], [1000.0, 5.0], [1100.0, 8.0], [1200.0, 9.0], [1300.0, 3.0], [1400.0, 13.0], [1500.0, 12.0], [1600.0, 18.0], [1700.0, 24.0], [1800.0, 30.0], [1900.0, 19.0], [2000.0, 20.0], [2100.0, 29.0], [2300.0, 22.0], [2200.0, 31.0], [2400.0, 17.0], [2500.0, 23.0], [2600.0, 17.0], [2700.0, 8.0], [2800.0, 9.0], [2900.0, 17.0], [3000.0, 16.0], [3100.0, 19.0], [3200.0, 35.0], [3300.0, 42.0], [3400.0, 16.0], [3500.0, 20.0], [3600.0, 16.0], [3700.0, 25.0], [3800.0, 14.0], [3900.0, 13.0], [4000.0, 25.0], [4100.0, 33.0], [4200.0, 18.0], [4300.0, 16.0], [4500.0, 31.0], [4400.0, 23.0], [4600.0, 45.0], [4700.0, 66.0], [4800.0, 91.0], [5000.0, 12.0], [4900.0, 34.0], [5100.0, 12.0], [5300.0, 2.0], [5200.0, 1.0], [500.0, 2.0]], "isOverall": false, "label": "/tx-mm/save/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 5300.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 79.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 921.0, "series": [{"data": [[1.0, 79.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 921.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 488.65299999999917, "minX": 1.58228328E12, "maxY": 488.65299999999917, "series": [{"data": [[1.58228328E12, 488.65299999999917]], "isOverall": false, "label": "/tx-mm/save/", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.58228328E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 544.0, "minX": 4.0, "maxY": 5218.0, "series": [{"data": [[4.0, 4711.5], [5.0, 4686.0], [6.0, 4709.0], [8.0, 4694.0], [9.0, 4707.0], [10.0, 4736.0], [11.0, 4739.0], [13.0, 4698.0], [14.0, 4961.0], [15.0, 4688.0], [16.0, 4726.0], [17.0, 4741.0], [19.0, 4714.5], [20.0, 5039.0], [21.0, 4725.0], [22.0, 4717.0], [23.0, 4696.0], [24.0, 5027.0], [25.0, 4727.0], [27.0, 4740.5], [28.0, 4684.0], [29.0, 4700.0], [30.0, 5195.0], [33.0, 5218.0], [32.0, 4720.5], [35.0, 4692.0], [34.0, 4672.0], [37.0, 4713.0], [36.0, 4702.0], [38.0, 4704.0], [41.0, 4690.0], [40.0, 4688.0], [43.0, 4688.5], [45.0, 4696.0], [44.0, 5155.0], [46.0, 4898.0], [51.0, 4665.0], [50.0, 4937.5], [53.0, 4685.0], [52.0, 4686.0], [55.0, 5013.0], [54.0, 4966.0], [57.0, 4925.0], [59.0, 5078.0], [58.0, 4682.0], [61.0, 4935.0], [63.0, 4917.0], [67.0, 4856.0], [66.0, 4973.0], [65.0, 4614.0], [64.0, 4975.0], [71.0, 4639.0], [70.0, 5111.0], [68.0, 4635.0], [75.0, 4631.0], [74.0, 5076.5], [72.0, 4672.0], [79.0, 4792.0], [78.0, 4878.0], [76.0, 4806.0], [82.0, 5124.0], [81.0, 4591.0], [80.0, 4802.0], [87.0, 5180.0], [86.0, 4911.0], [85.0, 4846.0], [84.0, 4897.0], [91.0, 5013.0], [90.0, 4796.0], [89.0, 4574.0], [88.0, 5113.0], [95.0, 4871.0], [94.0, 4876.0], [93.0, 4832.0], [92.0, 4842.0], [98.0, 4748.0], [103.0, 4960.0], [102.0, 4955.0], [100.0, 4928.5], [107.0, 5175.0], [106.0, 4813.0], [105.0, 4856.0], [110.0, 4661.0], [109.0, 4819.0], [108.0, 4882.0], [115.0, 5017.5], [113.0, 4876.0], [112.0, 4944.0], [119.0, 4857.0], [118.0, 4860.666666666667], [123.0, 4885.0], [122.0, 4844.0], [121.0, 4807.0], [120.0, 4683.0], [126.0, 4828.0], [125.0, 4883.0], [134.0, 4877.0], [133.0, 4882.0], [132.0, 4881.0], [131.0, 4373.0], [130.0, 4887.0], [129.0, 4922.666666666667], [143.0, 4791.0], [142.0, 4866.0], [141.0, 4865.5], [139.0, 4581.0], [137.0, 4903.0], [151.0, 5152.0], [150.0, 4847.5], [148.0, 4873.0], [147.0, 4849.0], [146.0, 4849.0], [145.0, 4826.0], [144.0, 4849.0], [158.0, 4937.0], [157.0, 4969.0], [156.0, 4326.0], [154.0, 4834.333333333333], [167.0, 4727.0], [166.0, 5018.0], [165.0, 4809.0], [164.0, 4815.0], [163.0, 4856.0], [162.0, 5198.0], [161.0, 4672.0], [160.0, 4836.0], [175.0, 4820.0], [174.0, 4681.0], [173.0, 4828.5], [171.0, 4749.0], [170.0, 4798.0], [169.0, 4507.0], [168.0, 5006.0], [182.0, 4878.0], [181.0, 4790.0], [180.0, 4905.5], [178.0, 4790.0], [191.0, 4940.0], [190.0, 4784.0], [189.0, 4940.0], [187.0, 4541.0], [186.0, 5002.0], [185.0, 4890.0], [199.0, 4827.0], [198.0, 4815.0], [197.0, 4910.0], [196.0, 4916.0], [195.0, 4665.5], [193.0, 4933.0], [192.0, 4792.0], [206.0, 4964.0], [205.0, 4779.333333333333], [202.0, 4981.0], [201.0, 4923.0], [200.0, 4825.0], [215.0, 4864.0], [214.0, 4808.0], [213.0, 4834.5], [212.0, 4788.0], [210.0, 4877.0], [209.0, 4808.0], [208.0, 4751.0], [223.0, 4783.0], [221.0, 4860.0], [220.0, 4826.0], [217.0, 4994.0], [231.0, 4137.0], [230.0, 4763.0], [229.0, 4830.0], [228.0, 4798.0], [225.0, 4766.0], [224.0, 4847.0], [238.0, 4793.0], [237.0, 4883.0], [236.0, 4817.0], [235.0, 4922.5], [233.0, 4820.0], [247.0, 4812.0], [246.0, 4783.0], [245.0, 4805.0], [244.0, 4791.0], [243.0, 4847.0], [242.0, 4680.0], [240.0, 4899.0], [255.0, 4743.0], [254.0, 4826.0], [253.0, 4660.0], [252.0, 4671.0], [250.0, 4683.0], [249.0, 4762.0], [248.0, 4703.0], [270.0, 4625.0], [271.0, 4759.0], [269.0, 4631.0], [259.0, 4582.0], [258.0, 4717.0], [257.0, 4763.0], [256.0, 4540.0], [267.0, 4417.5], [265.0, 4645.0], [264.0, 4754.0], [263.0, 4641.5], [261.0, 4759.0], [260.0, 4707.0], [275.0, 4732.0], [285.0, 4636.0], [286.0, 4557.0], [284.0, 4481.0], [283.0, 4579.0], [280.0, 4519.0], [279.0, 4581.5], [277.0, 4438.0], [276.0, 4504.0], [274.0, 4672.0], [273.0, 4403.0], [272.0, 4606.0], [302.0, 4431.0], [303.0, 4433.0], [301.0, 4559.0], [290.0, 4640.0], [289.0, 4744.0], [288.0, 4534.5], [299.0, 4439.0], [298.0, 4438.0], [297.0, 4596.0], [296.0, 4520.0], [295.0, 4576.0], [294.0, 4364.0], [293.0, 4454.0], [292.0, 4567.0], [318.0, 4310.0], [319.0, 4480.0], [317.0, 4456.0], [316.0, 4363.0], [315.0, 4364.0], [314.0, 4422.0], [313.0, 4514.0], [311.0, 4505.0], [305.0, 4543.0], [304.0, 4555.0], [307.0, 4474.0], [306.0, 4484.0], [310.0, 4490.0], [309.0, 4441.0], [308.0, 4468.0], [334.0, 4288.0], [335.0, 4278.0], [333.0, 4762.0], [332.0, 4158.0], [331.0, 4300.0], [330.0, 4300.0], [329.0, 4439.0], [328.0, 4363.0], [327.0, 4117.0], [321.0, 4340.0], [320.0, 4474.0], [323.0, 4355.0], [322.0, 4538.0], [326.0, 4536.0], [325.0, 4434.0], [324.0, 4366.0], [350.0, 4575.0], [351.0, 4015.0], [349.0, 4095.0], [348.0, 4154.5], [346.0, 4412.0], [345.0, 4262.0], [344.0, 4124.0], [343.0, 4242.0], [337.0, 4323.0], [336.0, 4265.0], [339.0, 4239.0], [338.0, 4296.0], [341.0, 4295.0], [340.0, 4363.0], [366.0, 4170.0], [367.0, 4082.0], [365.0, 4135.5], [354.0, 4187.0], [353.0, 4274.0], [352.0, 4223.0], [363.0, 4214.0], [361.0, 4022.0], [360.0, 4094.0], [359.0, 4101.0], [358.0, 4184.0], [357.0, 4117.0], [356.0, 4126.0], [382.0, 4019.0], [383.0, 4074.0], [381.0, 4121.0], [380.0, 4109.0], [379.0, 4141.0], [378.0, 4138.0], [377.0, 4121.0], [376.0, 4290.0], [375.0, 4208.0], [369.0, 4170.0], [368.0, 4263.0], [371.0, 4139.0], [370.0, 4090.0], [374.0, 4139.0], [373.0, 4136.0], [372.0, 4048.0], [398.0, 4031.0], [399.0, 4154.0], [397.0, 4055.0], [396.0, 3971.0], [395.0, 4166.0], [394.0, 4231.0], [393.0, 4237.0], [392.0, 4155.5], [390.0, 4073.5], [387.0, 4004.5], [385.0, 4100.0], [384.0, 4117.0], [388.0, 4100.0], [414.0, 4033.0], [415.0, 3837.0], [413.0, 4070.0], [412.0, 3976.0], [411.0, 3990.0], [410.0, 3911.0], [409.0, 4004.0], [408.0, 3948.5], [406.0, 4005.0], [401.0, 3922.0], [400.0, 4006.0], [403.0, 4018.0], [402.0, 4193.0], [405.0, 4085.0], [404.0, 4016.0], [430.0, 3781.0], [431.0, 3994.0], [429.0, 4008.0], [428.0, 3792.0], [427.0, 3865.0], [426.0, 3888.5], [424.0, 3928.0], [423.0, 3867.0], [417.0, 3965.0], [416.0, 3873.0], [419.0, 4055.0], [418.0, 3954.0], [422.0, 3818.0], [421.0, 3879.0], [420.0, 3943.0], [447.0, 3757.5], [445.0, 3779.0], [435.0, 3766.0], [434.0, 3863.0], [432.0, 3957.0], [443.0, 3783.0], [442.0, 3873.0], [441.0, 3784.0], [440.0, 3730.5], [438.0, 3810.0], [437.0, 3788.0], [436.0, 3782.0], [462.0, 3781.0], [463.0, 3608.0], [461.0, 3661.0], [460.0, 3670.0], [459.0, 3681.0], [458.0, 3664.0], [457.0, 3699.0], [456.0, 3683.0], [455.0, 3769.0], [449.0, 3748.0], [448.0, 3852.0], [451.0, 3747.0], [450.0, 3750.0], [454.0, 3732.0], [453.0, 3726.0], [452.0, 3726.0], [479.0, 3517.0], [475.0, 544.0], [478.0, 3510.5], [476.0, 3554.5], [474.0, 3556.0], [473.0, 3588.0], [472.0, 3565.0], [471.0, 3655.0], [465.0, 3704.0], [464.0, 3740.0], [467.0, 3719.0], [466.0, 3776.0], [470.0, 3620.0], [469.0, 3874.0], [468.0, 3617.0], [493.0, 3471.0], [495.0, 3521.5], [492.0, 3596.5], [482.0, 3457.0], [481.0, 3495.0], [480.0, 3587.0], [490.0, 3579.0], [489.0, 3537.0], [488.0, 3431.0], [487.0, 3442.0], [486.0, 3536.0], [485.0, 3454.6666666666665], [499.0, 3560.0], [510.0, 3427.0], [511.0, 3429.0], [508.0, 3405.5], [506.0, 3435.0], [505.0, 3394.0], [503.0, 3484.0], [501.0, 3383.0], [500.0, 3368.0], [498.0, 3461.0], [496.0, 3528.0], [537.0, 3230.0], [541.0, 3413.0], [542.0, 3337.0], [531.0, 3274.0], [530.0, 3325.0], [533.0, 3352.0], [532.0, 3298.0], [540.0, 3630.0], [539.0, 3314.0], [538.0, 3334.0], [536.0, 3342.0], [519.0, 3306.0], [518.0, 3413.0], [517.0, 3315.3333333333335], [514.0, 3470.0], [513.0, 3325.0], [512.0, 3425.0], [527.0, 3510.0], [525.0, 3268.0], [524.0, 3428.0], [523.0, 3381.0], [522.0, 3390.0], [521.0, 3296.0], [520.0, 3305.0], [535.0, 3336.0], [534.0, 3348.0], [570.0, 3303.5], [574.0, 3143.0], [575.0, 3036.0], [560.0, 3294.0], [563.0, 3209.0], [561.0, 3722.0], [565.0, 3462.0], [564.0, 3099.0], [573.0, 3224.0], [572.0, 3195.0], [571.0, 3197.0], [568.0, 3208.0], [551.0, 3308.0], [550.0, 3269.0], [549.0, 3268.0], [548.0, 3317.0], [547.0, 3264.5], [545.0, 3281.0], [544.0, 3320.0], [559.0, 3204.0], [558.0, 3252.0], [557.0, 3247.0], [555.0, 3272.0], [554.0, 3212.0], [552.0, 3295.0], [567.0, 3206.0], [566.0, 3205.0], [601.0, 3138.3333333333335], [606.0, 3075.0], [607.0, 3087.0], [593.0, 3282.0], [592.0, 3039.0], [605.0, 3037.0], [604.0, 3184.5], [602.0, 3368.0], [600.0, 3109.0], [582.0, 3169.0], [581.0, 3170.0], [580.0, 3171.0], [579.0, 3232.0], [578.0, 3695.0], [577.0, 3375.0], [576.0, 3177.0], [591.0, 3349.0], [590.0, 2961.0], [589.0, 3301.0], [588.0, 3241.0], [587.0, 3124.0], [586.0, 3012.0], [585.0, 3140.0], [584.0, 3108.0], [597.0, 3380.0], [594.0, 3322.0], [633.0, 2954.0], [637.0, 3190.0], [639.0, 3320.0], [624.0, 2925.0], [626.0, 2927.0], [625.0, 2961.0], [628.0, 2864.0], [627.0, 2981.0], [636.0, 2924.0], [635.0, 2935.0], [634.0, 2904.0], [632.0, 2944.0], [615.0, 3212.0], [614.0, 3228.0], [613.0, 3035.0], [612.0, 3301.0], [611.0, 2953.0], [610.0, 3032.0], [609.0, 3153.0], [623.0, 2997.0], [622.0, 2985.5], [620.0, 3139.0], [619.0, 3266.0], [618.0, 3176.0], [617.0, 3087.0], [616.0, 2960.0], [631.0, 3049.5], [629.0, 2967.0], [665.0, 2631.0], [670.0, 2574.0], [671.0, 2413.0], [656.0, 2664.0], [658.0, 2775.0], [657.0, 2537.0], [660.0, 2459.0], [659.0, 2509.0], [668.0, 2571.0], [667.0, 2630.0], [666.0, 2748.0], [664.0, 2665.5], [647.0, 3063.5], [645.0, 3111.0], [643.0, 2895.0], [642.0, 2721.0], [641.0, 2841.0], [655.0, 2687.0], [654.0, 2539.0], [653.0, 2676.0], [652.0, 2650.0], [651.0, 2896.0], [650.0, 2829.0], [649.0, 2861.5], [662.0, 2741.0], [661.0, 2637.0], [696.0, 2219.0], [702.0, 2506.0], [691.0, 1016.5], [692.0, 1308.3333333333335], [693.0, 2528.0], [695.0, 2572.0], [694.0, 2591.0], [687.0, 1453.0], [679.0, 2574.0], [678.0, 2619.0], [677.0, 2645.0], [676.0, 2547.0], [675.0, 2592.5], [673.0, 2507.5], [686.0, 2605.0], [698.0, 2640.0], [701.0, 2277.0], [700.0, 2381.0], [685.0, 1871.8], [684.0, 709.5], [683.0, 797.0], [682.0, 1728.5], [680.0, 2362.0], [703.0, 2511.0], [688.0, 2622.0], [690.0, 2339.0], [689.0, 2619.0], [729.0, 2504.0], [733.0, 2124.0], [735.0, 2378.5], [721.0, 2531.0], [720.0, 2192.0], [724.0, 2325.5], [722.0, 2376.0], [732.0, 2461.0], [731.0, 2347.0], [730.0, 2351.0], [728.0, 2374.0], [711.0, 2432.0], [710.0, 2262.0], [709.0, 2269.0], [708.0, 2466.0], [707.0, 2677.3333333333335], [704.0, 2500.0], [719.0, 2400.0], [718.0, 2224.0], [717.0, 2312.5], [715.0, 2247.0], [714.0, 2418.0], [713.0, 2348.5], [727.0, 2363.0], [726.0, 2419.5], [762.0, 2244.0], [755.0, 2266.0], [766.0, 2182.3333333333335], [767.0, 2098.0], [754.0, 2245.0], [753.0, 2341.0], [763.0, 2326.0], [761.0, 2374.0], [743.0, 2067.5], [742.0, 2268.0], [740.0, 2252.0], [739.0, 2374.0], [737.0, 2323.0], [736.0, 2494.0], [751.0, 2015.0], [750.0, 2347.0], [749.0, 2302.0], [748.0, 2295.0], [747.0, 2297.0], [746.0, 2332.0], [744.0, 2218.0], [759.0, 2267.0], [757.0, 2166.0], [756.0, 2165.0], [796.0, 1135.0], [774.0, 882.0], [771.0, 2102.0], [770.0, 2230.5], [768.0, 2153.0], [775.0, 2229.0], [781.0, 2253.0], [779.0, 2172.0], [778.0, 2237.0], [776.0, 2202.0], [797.0, 883.0], [795.0, 1322.3333333333333], [794.0, 1197.75], [793.0, 1448.5], [792.0, 1326.3333333333333], [791.0, 1499.0], [790.0, 1541.5], [799.0, 2091.0], [785.0, 2169.0], [784.0, 2188.3333333333335], [787.0, 2390.0], [786.0, 2111.0], [789.0, 2096.0], [788.0, 2078.0], [798.0, 2095.0], [827.0, 1910.0], [802.0, 1236.25], [801.0, 1575.5], [800.0, 2324.0], [814.0, 2088.3333333333335], [811.0, 1975.0], [810.0, 2079.0], [809.0, 1990.0], [808.0, 2103.0], [807.0, 1536.5], [806.0, 2114.0], [805.0, 2122.0], [804.0, 2083.0], [803.0, 2139.0], [824.0, 2143.0], [831.0, 1871.5], [817.0, 1949.0], [816.0, 2104.0], [819.0, 2013.0], [818.0, 2052.0], [821.0, 1917.0], [820.0, 1728.0], [823.0, 1990.0], [822.0, 1693.0], [829.0, 1893.0], [828.0, 1966.0], [826.0, 1913.0], [825.0, 1932.0], [862.0, 1802.0], [851.0, 1433.5], [843.0, 1378.0], [844.0, 1064.0], [856.0, 1844.5], [839.0, 1885.0], [838.0, 1905.0], [837.0, 1871.0], [836.0, 1903.0], [835.0, 1904.0], [834.0, 1883.0], [832.0, 1920.0], [845.0, 1968.0], [859.0, 1800.5], [857.0, 1699.0], [861.0, 1804.0], [860.0, 1898.0], [863.0, 1903.0], [848.0, 1813.6666666666667], [850.0, 1298.6666666666667], [849.0, 1459.5], [842.0, 1467.5], [841.0, 1471.5], [840.0, 1429.0], [854.0, 1554.5], [853.0, 1557.5], [852.0, 1448.0], [868.0, 1557.5], [866.0, 1456.5], [865.0, 1563.5], [864.0, 1455.0], [871.0, 1423.5], [890.0, 1748.0], [889.0, 1609.5], [892.0, 1740.0], [891.0, 1764.0], [895.0, 1664.3333333333333], [883.0, 1772.0], [882.0, 1756.3333333333333], [885.0, 1647.0], [884.0, 1478.0], [893.0, 1733.0], [887.0, 1606.75], [886.0, 1523.0], [870.0, 1436.3333333333333], [869.0, 1341.0], [867.0, 1086.0], [879.0, 1637.0], [878.0, 1621.5], [877.0, 1352.0], [876.0, 1662.0], [875.0, 1580.5], [873.0, 1380.0], [872.0, 1816.0], [874.0, 1819.5], [916.0, 1649.0], [908.0, 1548.0], [907.0, 1683.0], [906.0, 1419.0], [905.0, 1702.0], [904.0, 1705.0], [909.0, 1547.0], [918.0, 1605.0], [921.0, 1601.0], [920.0, 1620.0], [903.0, 1580.0], [902.0, 1448.0], [901.0, 1605.5], [899.0, 1692.0], [897.0, 1678.5], [911.0, 1453.5], [919.0, 1631.0], [917.0, 1637.0], [914.0, 1589.5], [912.0, 1588.0]], "isOverall": false, "label": "/tx-mm/save/", "isController": false}, {"data": [[488.65299999999917, 3379.093000000001]], "isOverall": false, "label": "/tx-mm/save/-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 921.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 2150.0, "minX": 1.58228328E12, "maxY": 2366.6666666666665, "series": [{"data": [[1.58228328E12, 2366.6666666666665]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.58228328E12, 2150.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.58228328E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 3379.093000000001, "minX": 1.58228328E12, "maxY": 3379.093000000001, "series": [{"data": [[1.58228328E12, 3379.093000000001]], "isOverall": false, "label": "/tx-mm/save/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.58228328E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 3378.935, "minX": 1.58228328E12, "maxY": 3378.935, "series": [{"data": [[1.58228328E12, 3378.935]], "isOverall": false, "label": "/tx-mm/save/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.58228328E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 11.015000000000008, "minX": 1.58228328E12, "maxY": 11.015000000000008, "series": [{"data": [[1.58228328E12, 11.015000000000008]], "isOverall": false, "label": "/tx-mm/save/", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.58228328E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 544.0, "minX": 1.58228328E12, "maxY": 5387.0, "series": [{"data": [[1.58228328E12, 5387.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.58228328E12, 544.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.58228328E12, 4856.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.58228328E12, 5154.97]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.58228328E12, 4936.799999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.58228328E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 3479.5, "minX": 16.0, "maxY": 3479.5, "series": [{"data": [[16.0, 3479.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 3479.0, "minX": 16.0, "maxY": 3479.0, "series": [{"data": [[16.0, 3479.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.58228328E12, "maxY": 16.666666666666668, "series": [{"data": [[1.58228328E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.58228328E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.58228328E12, "maxY": 16.666666666666668, "series": [{"data": [[1.58228328E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.58228328E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 16.666666666666668, "minX": 1.58228328E12, "maxY": 16.666666666666668, "series": [{"data": [[1.58228328E12, 16.666666666666668]], "isOverall": false, "label": "/tx-mm/save/-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.58228328E12, "title": "Transactions Per Second"}},
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
