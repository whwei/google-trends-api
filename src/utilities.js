'use strict';
export function isLessThan7Days(date1, date2) {
  return (Math.abs(date2 - date1) / (24 * 60 * 60 * 1000)) < 7;
};

export function convertDateToString(d, shouldIncludeTime) {
  let month = (d.getUTCMonth() + 1).toString();

  month = month.length < 2 ? '0' + month : month;
  const day = d.getUTCDate().toString();
  const year = d.getUTCFullYear().toString();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();

  if (shouldIncludeTime) {
    return `${year}-${month}-${day}T${hour}\\:${minute}\\:00`;
  }

  return `${year}-${month}-${day}`;
};

export function formatTime(obj) {
  if (obj.startTime && !(obj.startTime instanceof Date)) {
    return new Error('startTime must be a Date object');
  }
  if (obj.endTime && !(obj.endTime instanceof Date)) {
    return new Error('endTime must be a Date object');
  }

  if (obj.startTime && obj.endTime && obj.startTime > obj.endTime) {
    const temp = obj.startTime;

    obj.startTime = obj.endTime;
    obj.endTime = temp;
  }

  if (!obj.endTime) obj.endTime = new Date();
  if (!obj.startTime) obj.startTime = new Date('2004-01-01');

  const shouldIncludeTime = isLessThan7Days(obj.startTime, obj.endTime);

  const startTime = convertDateToString(obj.startTime, shouldIncludeTime);
  const endTime = convertDateToString(obj.endTime, shouldIncludeTime);

  obj.time = `${startTime} ${endTime}`;
  return obj;
};

export function constructObj(obj, cbFunc) {
  if (typeof obj === 'function') cbFunc = obj;

  if (!obj || !!obj && typeof obj !== 'object' || Array.isArray(obj)) {
    obj = new Error('Must supply an object');
  } else if (!obj.keyword) obj = new Error('Must have a keyword field');

  if (!!cbFunc && typeof cbFunc !== 'function') {
    obj = new Error('Callback function must be a function');
  }

  if (!obj.hl) obj.hl = 'en-US';
  if (!obj.category) obj.category = 0;

  if (!cbFunc) {
    cbFunc = (err, res) => {
      if (err) return err;
      return res;
    };
  }

  obj = formatTime(obj);

  return {
    cbFunc,
    obj,
  };
};

export function formatResolution(resolution = '') {
  const resolutions = ['COUNTRY', 'REGION', 'CITY', 'DMA'];
  const isResValid = resolutions.some((res) => {
    return res === resolution.toUpperCase();
  });

  if (isResValid) return resolution.toUpperCase();
  return '';
}

/**
 * Parse the result of the google api as JSON
 * Throws an Error if the JSON is invalid
 * @param  {String} results
 * @return {Object}
 */
export function parseResults(results) {
  // If this fails, you've hit the rate limit or Google has changed something
  try {
    return JSON.parse(results.slice(4)).widgets;
  } catch (e) {
    // Throw the JSON error e.g.
    // { message: 'Unexpected token C in JSON at position 0',
    //   requestBody: '<!DOCTYPE html><html>...'}
    e.requestBody = results;
    throw e;
  }
}

/**
 * Create the array of keywords (comparisonItems) to be used
 * @param  {Object} obj The query obj with .keyword property
 * @return {Array}     Returns an array of comparisonItems
 */
export function formatKeywords(obj) {

  // If we are requesting an array of keywords for comparison
  if (Array.isArray(obj.keyword)) {

    // Map the keywords to the items array
    return obj.keyword.reduce((arr, keyword) => {
      // Add the keyword to the array
      arr.push({ ...obj, keyword });

      return arr;
    }, []);

  }

  return [obj];
}

export function getResults(request) {
  return (searchType, obj) => {
    const map = {
      'auto complete': {
        path: `/trends/api/autocomplete/${encodeURIComponent(obj.keyword)}`,
        pos: 0,
      },
      'interest over time': {
        path: '/trends/api/widgetdata/multiline',
        pos: 0,
      },
      'interest by region': {
        path: '/trends/api/widgetdata/comparedgeo',
        pos: 1,
        resolution: formatResolution(obj.resolution),
      },
      'related topics': {
        path: '/trends/api/widgetdata/relatedsearches',
        pos: 2,
      },
      'related queries': {
        path: '/trends/api/widgetdata/relatedsearches',
        pos: 3,
      },
    };

    const options = {
      method: 'GET',
      host: 'trends.google.com',
      path: '/trends/api/explore',
      proxy: obj.proxy,
      qs: {
        hl: obj.hl,
        req: JSON.stringify({
          comparisonItem: formatKeywords(obj),
          category: obj.category,
          property: '',
        }),
        tz: 300,
      },
    };

    const {pos, path, resolution} = map[searchType];

    return request(options)
    .then((results) => {
      const parsedResults = parseResults(results);
      let req = parsedResults[pos].request;

      if (resolution) req.resolution = resolution;
      req.requestOptions.category = obj.category;
      req.requestOptions.property = '';
      req = JSON.stringify(req);

      const token = parsedResults[pos].token;
      const nextOptions = {
        path,
        method: 'GET',
        host: 'trends.google.com',
        qs: {
          hl: obj.hl,
          req,
          token,
          tz: 300,
        },
      };

      return request(nextOptions);
    })
    .then((res) => {
      try {
        /** JSON.parse will decode unicode */
        const results = JSON.stringify(JSON.parse(res.slice(5)));

        return results;
      } catch (e) {
        /** throws if not valid JSON, so just return unaltered res string */
        return res;
      }
    });
  };
};
