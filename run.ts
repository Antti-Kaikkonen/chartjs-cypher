import * as http from 'http';
import * as request from 'request';
import * as url from 'url';

let config = require('./config');

const ChartjsNode = require('chartjs-node');

let cypher_url = config.neo4j_url;


let chartColors: any[] = [
  {
    backgroundColor: 'hsl(240, 100%, 55%)',
    borderColor: 'hsl(240, 100%, 55%)'
  },
  {
    backgroundColor: 'hsl(0, 100%, 30%)',
    borderColor: 'hsl(0, 100%, 30%)'
  },
  {
    backgroundColor: 'hsl(120, 100%, 50%)',
    borderColor: 'hsl(120, 100%, 50%)'
  },
  {
    backgroundColor: 'hsl(300, 100%, 50%)',//purple
    borderColor: 'hsl(300, 100%, 50%)'
  },
  {
    backgroundColor: 'hsl(60, 100%, 45%)',//yellow
    borderColor: 'hsl(60, 100%, 45%)'
  },
  {
    backgroundColor: 'hsl(180, 100%, 55%)',//cyan
    borderColor: 'hsl(180, 100%, 55%)'
  }
];


let lineChartOptions = {
    elements: {
        line: {
            tension: 0
        }
    },
    scales: {
        display: true,
        xAxes: [{
            type: 'time',
            distribution: 'linear'
        }],
        yAxes: [{
          display: true,
          scaleLabel: {
            display: true,
            labelString: ''
          }
        }]
    },
    legend: {
        display: false
    }
};

let barChartOptions = {... lineChartOptions};


let pieChartOptions:any = {
  legend: {
    display: true
  }
};


export interface CypherResponse {
  columns?: string[];
  data?: object[];
}
 

let executeQuery = (query: string, params: object, cb: (error, response, body: CypherResponse) => void): any => {

  request.post(
    cypher_url,
    { json: { query: query, 
              params: params 
            } 
    },cb
  );
};

http.createServer((request, response) => {
  let query: any = url.parse(request.url, true).query;
  if (query.query) {
    executeQuery(query.query, {}, (cypherError, cypherResponse, cypherBody: CypherResponse) => {

      if (cypherError || cypherResponse.statusCode != 200) {
        response.writeHead(400, {'Content-Type': 'image/png'});
        response.end();
        return;
      }

      let convertToDate: boolean = cypherBody.columns[0] === "date";

      let dataSets = [];

      if (cypherBody.columns.length === 3) {
        let groupedBySeries = cypherBody.data.reduce((map, row) => {
          if (map[row[2]] === undefined) {
            map[row[2]] = [row];
          } else {
            map[row[2]].push(row);
          }
          return map;
        }, {});

        Object.keys(groupedBySeries).forEach((seriesName: string, index: number) => {
          if (groupedBySeries.hasOwnProperty(seriesName)) {
            let data;
            if (convertToDate) {
              data = groupedBySeries[seriesName].sort((rowA, rowB) => rowA[0]-rowB[0]);
            } else {
              data = groupedBySeries[seriesName];
            }
            dataSets.push({
              label: seriesName,
              backgroundColor: chartColors[index].backgroundColor,
              borderColor: chartColors[index].borderColor,
              fill: false,
              borderWidth: 1,
              pointRadius: (query.x_axis === "false" && query.y_axis === "false") ? 0 : 1,
              pointHitRadius: 5, 
              data: data.map(row => {
                return {x: convertToDate ? new Date(row[0]*1000) : row[0], y: row[1]};
              })
            });
          }
        });
      } else if (cypherBody.columns.length === 2) {
        let data;
        if (convertToDate) {
          data = cypherBody.data.sort((rowA, rowB) => rowA[0]-rowB[0]);
        } else {
          data = cypherBody.data;
        }
        dataSets.push({
            label: "Data",
            backgroundColor: chartColors[0].backgroundColor,
            borderColor: chartColors[0].borderColor,
            fill: false,
            borderWidth: 1,
            pointRadius: (query.x_axis === "false" && query.y_axis === "false") ? 0 : 1,
            pointHitRadius: 5,
            data: data.map(row => {
                return {x: convertToDate ? new Date(row[0]*1000) : row[0], y: row[1]};
            })
          }
        )
      }

      

      let path = url.parse(request.url).pathname;
      let chartJsOptions;
      if (path === "/line.png") {
      	chartJsOptions = {
      		type: "line",
      		data: {
      			datasets: dataSets
      		},
      		options: {... lineChartOptions}
      	};
      } else if (path === "/bar.png") {
      	chartJsOptions = {
      		type: "bar",
      		data: {
      			datasets: dataSets
      		},
      		options: {... barChartOptions}
      	};
      } else if (path === "/pie.png") {

        let categoricalData = cypherBody.data.map(row => row[1]);

        let categories = cypherBody.data.map(row => convertToDate ? new Date(row[0]*1000).toDateString() : row[0]);

        let bgColors = [];
        while (bgColors.length < categories.length) {
          bgColors = bgColors.concat(chartColors.map(v => v.backgroundColor));
        }

      	chartJsOptions = {
      		type: "pie",
          data: {
            datasets: [{
              data: categoricalData,
              backgroundColor: bgColors,
              borderWidth: 0,
              borderColor: "black"
            }],
            labels: categories
          },
          options: {... pieChartOptions}
      	};
      }

      if (path === "/line.png" || path === "/bar.png") {
        if (query.x_title !== undefined) {
          chartJsOptions.options.scales.xAxes[0].scaleLabel = {
            labelString: query.x_title,
            display: true
          }
        } else {
          chartJsOptions.options.scales.xAxes[0].scaleLabel = {
            display: false
          }
        }
        if (query.y_title !== undefined) {
          chartJsOptions.options.scales.yAxes[0].scaleLabel = {
            labelString: query.y_title,
            display: true
          }
        } else {
          chartJsOptions.options.scales.yAxes[0].scaleLabel = {
            display: false
          }
        }
        chartJsOptions.options.scales.xAxes[0].display = !(query.x_axis === "false");
        chartJsOptions.options.scales.yAxes[0].display = !(query.y_axis === "false");
      }

      chartJsOptions.options.legend = {
        display: query.legend === "true"
      };
      if (query.title !== undefined) {
        chartJsOptions.options.title = {
          text: query.title,
          display: true
        }
      } else {
        chartJsOptions.options.title = {
          display: false
        }
      }

      let width = 600;
      if (query.width && !isNaN(Number(query.width))) {
        width = Math.max(10, Math.min(4000, Number(query.width)));
      }

      let height = 600;
      if (query.height && !isNaN(Number(query.height))) {
        height = Math.max(10, Math.min(4000, Number(query.height)));
      }

			// 600x600 canvas size
			var chartNode = new ChartjsNode(width, height);
			chartNode.drawChart(chartJsOptions)
			.then(() => {
			    return chartNode.getImageBuffer('image/png');
			})
			.then(buffer => {
			    response.writeHead(200, {'Content-Type': 'image/png'});
			    response.write(buffer);
			    response.end();
          chartNode.destroy();
			});

    });
  } else {
  	response.end();
  }
})
.listen(config.port, config.host);

process.on('uncaughtException', function(e){
    console.log("uncaught exception", e);
});
