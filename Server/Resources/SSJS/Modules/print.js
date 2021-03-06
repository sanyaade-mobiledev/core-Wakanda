/* Copyright (c) 4D, 2011
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in
* all copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
* THE SOFTWARE.
*/


/*
 * This file is part of Wakanda software, licensed by 4D under
 *  (i) the GNU General Public License version 3 (GNU GPL v3), or
 *  (ii) the Affero General Public License version 3 (AGPL v3) or
 *  (iii) a commercial license.
 * This file remains the exclusive property of 4D and/or its licensors
 * and is protected by national and international legislations.
 * In any event, Licensee's compliance with the terms and conditions
 * of the applicable license constitutes a prerequisite to any use of this file.
 * Except as otherwise expressly stated in the applicable license,
 * such license does not include any other license or rights on this file,
 * 4D's and/or its licensors' trademarks and/or other proprietary rights.
 * Consequently, no title, copyright or other proprietary rights
 * other than those specified in the applicable license is granted.
 */

/**
 * Execute a template to get the associated PDF
 * @module print/print
 * @method print
 * @param {Object} params
 * @return {String} true if the pdf is generated, otherwise false   
 * 
 * @exemple
 *   require('print').toPdf({
 *	report: "/myReport.waReport/",
 *	output: "/myReport.waReport/myreport.pdf"
 *   });
 *  
 */
exports.toPdf = function (params) {
    var wkhtmltopdfPath = application.getWalibFolder().path.replace('walib', 'Resources') + 'wkhtmltopdf', 	
    fullPathPdf = '',
    pdfWorker = null,
    options = '',
    fullUrlReport = '',
    fullUrlPdf = '',
    serverIp = '127.0.0.1',
    serverPort = '',
    defaultOutput = '';
    
    // default value for report name
    if (params.report.indexOf('.html') != -1) {
        defaultOutput = params.report.replace('.html','.pdf');
    } else {
        defaultOutput = params.report + '/' + 'index.html';
    }   
    
    params         = params         || {};
    params.report  = params.report  || '';
    params.output  = params.output  || defaultOutput;
    params.options = params.options || ''; 
    params.delay   = params.delay   || '1000'; 
    
    // get server informations
    serverIp = application.httpServer.ipAddress;
    serverPort = application.settings.getItem('http').port;
	   
    // get full url report
    if (params.report.indexOf('.html') == -1) {
        fullUrlReport = serverIp + ':' + serverPort + '/' + params.report + '/' + 'index.html';
    } else {
        fullUrlReport = serverIp + ':' + serverPort + '/' + params.report;
    }
    fullUrlReport = "http://" + fullUrlReport.replace(/\/\//g,'/');
    
    // get full url pdf   
    fullUrlPdf = serverIp + ':' + serverPort + '/' + params.output;
    fullUrlPdf = "http://" + fullUrlPdf.replace(/\/\//g,'/');
    
    // get full path of the pdf
    fullPathPdf = application.getFolder('url', false);
    fullPathPdf = fullPathPdf + 'WebFolder/' + params.output; 
   
    // Launch the worker
    if (os.isLinux) {
        pdfWorker = new SystemWorker('"' + wkhtmltopdfPath + '/wkhtmltopdf " ' + options +  ' --javascript-delay ' + params.delay + ' " ' + fullUrlReport + '" "' + fullPathPdf + '"');	
    } 
    if (os.isWindows) {      
        pdfWorker = new SystemWorker('"' + wkhtmltopdfPath + '/wkhtmltopdf" ' + options +  ' --javascript-delay ' + params.delay + ' " ' + fullUrlReport + '" "' + fullPathPdf + '"');	
    } 
    if (os.isMac) {	
        pdfWorker = new SystemWorker('"' + wkhtmltopdfPath + '/wkhtmltopdf.app/Contents/MacOS/wkhtmltopdf" ' + options +  ' --javascript-delay ' + params.delay + ' " ' + fullUrlReport + '" "' + fullPathPdf.replace('file://', '') + '"');
    }
   
    pdfWorker.onmessage = function () {                       
    }

    pdfWorker.onterminated = function () {
        message = fullUrlPdf;                 
        exitWait();
    }

    pdfWorker.onerror = function (data) {
        message = "error:" + JSON.stringify(data);
    }

    wait(10000);					
				
    return message;
}

exports.getModulePath = function () {
    return module.id;
};
