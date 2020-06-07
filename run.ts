import express = require('express');
import * as request from 'request';

const config = require('./config');

const ChartjsNode = require('chartjs-node');

const app = express();

app.enable('etag');
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
});
app.options("/*", function(req, res, next){
	res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Content-Length, X-Requested-With');
  res.sendStatus(200);
});	

app.get("/line.png", (clientRequest: express.Request, clientResponse: express.Response, next: express.NextFunction) => {
  let query = clientRequest.query.query.toString();
  let params = clientRequest.query.params ? JSON.parse(clientRequest.query.params.toString()) : {};
  executeQuery(query, params, (cypherError, cypherResponse, cypherBody: CypherResponse) => {
    try {
      if (cypherError || cypherResponse.statusCode != 200) {
        clientResponse.sendStatus(400);
      }
      let pointRadius = (clientRequest.query.x_axis === "false" && clientRequest.query.y_axis === "false") ? 0 : 1;
      let dataSets = responseToDataSets(cypherBody, pointRadius);

      let chartJsOptions = {
        type: "line",
        data: {
          datasets: dataSets
        },
        options: {... lineChartOptions}
      };
      configureAxes(chartJsOptions, clientRequest.query);
      configureGlobal(chartJsOptions, clientRequest.query);
      sendChart(chartJsOptions, getWidth(clientRequest.query), getHeight(clientRequest.query), clientResponse);
    } catch (error) {
      next(error);
    } 
  });  
});

app.get("/bar.png", (clientRequest: express.Request, clientResponse: express.Response, next: express.NextFunction) => {
  let query: string = clientRequest.query.query.toString();
  let params = clientRequest.query.params ? JSON.parse(clientRequest.query.params.toString()) : {};
  executeQuery(query, params, (cypherError, cypherResponse, cypherBody: CypherResponse) => {
    try {
      if (cypherError || cypherResponse.statusCode != 200) {
        clientResponse.sendStatus(400);
      }
      let pointRadius = (clientRequest.query.x_axis === "false" && clientRequest.query.y_axis === "false") ? 0 : 1;
      let dataSets = responseToDataSets(cypherBody, pointRadius);
      
      let chartJsOptions = {
        type: "bar",
        data: {
          datasets: dataSets
        },
        options: {... barChartOptions} 
      }
      configureAxes(chartJsOptions, clientRequest.query);
      configureGlobal(chartJsOptions, clientRequest.query);
      sendChart(chartJsOptions, getWidth(clientRequest.query), getHeight(clientRequest.query), clientResponse);
    } catch (error) {
      next(error);
    }  
  }); 
    
});

app.get("/pie.png", (clientRequest: express.Request, clientResponse: express.Response, next: express.NextFunction) => {
  let query = clientRequest.query.query.toString();
  let params = clientRequest.query.params ? JSON.parse(clientRequest.query.params.toString()) : {};
  executeQuery(query, params, (cypherError, cypherResponse, cypherBody: CypherResponse) => {
    try {
      if (cypherError || cypherResponse.statusCode != 200) {
        clientResponse.sendStatus(400);
      }
      let categoricalData = cypherBody.data.map(row => row[1]);

      let convertToDate: boolean = cypherBody.columns[0] === "date";
      let categories = cypherBody.data.map(row => convertToDate ? new Date(row[0]*1000).toDateString() : row[0]);

      let bgColors = [];
      while (bgColors.length < categories.length) {
        bgColors = bgColors.concat(chartColors.map(v => v.backgroundColor));
      }

      let chartJsOptions = {
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
      configureGlobal(chartJsOptions, clientRequest.query);
      sendChart(chartJsOptions, getWidth(clientRequest.query), getHeight(clientRequest.query), clientResponse);
    } catch (error) {
      next(error);
    }  
  }); 
});

app.listen(config.port, config.host, () => console.log('Listening on port ', config.port));


let executeQuery = (query: string, params: object, cb: (error, response, body: CypherResponse) => void): any => {

  request.post(
    config.neo4j_url,
    { json: { query: query, 
              params: params 
            } 
    },cb
  );
};

let sendChart = (chartJsOptions: any, width: number, height: number, clientResponse: express.Response) => {
  var chartNode = new ChartjsNode(width, height);
  chartNode.drawChart(chartJsOptions)
  .then(() => {
      return chartNode.getImageBuffer('image/png');
  })
  .then(buffer => {
      clientResponse.contentType("png");
      clientResponse.send(buffer);
      chartNode.destroy();
  });
}


let getWidth = (queryParams): number => {
  let width = 600;
  if (queryParams.width && !isNaN(Number(queryParams.width))) {
    width = Math.max(10, Math.min(4000, Number(queryParams.width)));
  }
  return width;
}

let getHeight = (queryParams): number => {
  let height = 600;
  if (queryParams.height && !isNaN(Number(queryParams.height))) {
    height = Math.max(10, Math.min(4000, Number(queryParams.height)));
  }
  return height;
}


let configureGlobal = (chartJsOptions, queryParams) => {
  chartJsOptions.options.legend = {
    display: queryParams.legend === "true"
  };
  if (queryParams.title !== undefined) {
    chartJsOptions.options.title = {
      text: queryParams.title,
      display: true
    }
  } else {
    chartJsOptions.options.title = {
      display: false
    }
  }
}

let configureAxes = (chartJsOptions, queryParams) =>  {
  if (queryParams.x_title !== undefined) {
    chartJsOptions.options.scales.xAxes[0].scaleLabel = {
      labelString: queryParams.x_title,
      display: true
    }
  } else {
    chartJsOptions.options.scales.xAxes[0].scaleLabel = {
      display: false
    }
  }
  if (queryParams.y_title !== undefined) {
    chartJsOptions.options.scales.yAxes[0].scaleLabel = {
      labelString: queryParams.y_title,
      display: true
    }
  } else {
    chartJsOptions.options.scales.yAxes[0].scaleLabel = {
      display: false
    }
  }
  chartJsOptions.options.scales.xAxes[0].display = !(queryParams.x_axis === "false");
  chartJsOptions.options.scales.yAxes[0].display = !(queryParams.y_axis === "false");
}


let responseToDataSets = (cypherBody: CypherResponse, pointRadius: number): any[] => {
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
          pointRadius: pointRadius,
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
        pointRadius: pointRadius,
        pointHitRadius: 5,
        data: data.map(row => {
            return {x: convertToDate ? new Date(row[0]*1000) : row[0], y: row[1]};
        })
      }
    )
  }
  return dataSets;
}


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