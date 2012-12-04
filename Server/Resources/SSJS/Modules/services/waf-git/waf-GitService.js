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

* @author Sergiy.Temnikov@4d.com

*/

/*
	-- init remote repo in a given folder over http; folder path is relative to user's "Documents" folder
	http://127.0.0.1:8081/gitservice/repo/init?path=HostedByWakanda

	-- switch remote repo to a given folder over http; folder path is relative to user's "Documents" folder
	http://127.0.0.1:8080/gitservice/repo/dir?path=HostedByWakanda

	-- push my local repo to the master branch on remote repo with git over http
	git push http://sergiy:123@127.0.0.1:8081/gitservice/repo master

	-- clone remote repo to my local folder with git over http
	git clone http://admin:123@192.168.6.26:8081/gitservice/repo ClonedFromWakanda/
	
	-- pull updates from remote repo to my local repo with git over http
	git pull http://sergiy:123@192.168.6.23:8081/gitservice/repo	
	

	GIT HTTPS

	Need to disable SSL certificate verification:
		git config --global http.sslVerify false
		
	See all TODOs
*/


var services = require('services');


var			gitBuffer = new Buffer ( 100 * 1024 ); // Start with 100K, buffer will grow dynamically as needed
var			gitBufferSize = 0;


function _gitAddToBuffer ( inBuffer )
{
	var			nAddedLength = inBuffer. length;
	if ( gitBufferSize + nAddedLength > gitBuffer. length )
	{
		var		nAdditionalIncrement = 1000 * 1024; // Add extra 1MB
		var		bffrNew = new Buffer ( gitBufferSize + nAddedLength + nAdditionalIncrement );
		gitBuffer. copy ( bffrNew, 0 );
		gitBuffer = bffrNew;
	}
	
	inBuffer. copy ( gitBuffer, gitBufferSize );
	gitBufferSize += nAddedLength;
}

function gitPadFromLeft ( str, strPad, maxLength )
{
	while ( str. length < maxLength )
		str = strPad + str;

    return str;
}

function gitCreateSmartPacket ( str )
{
	var		strHeader = ( str. length + 4 ). toString ( 16 );
	strHeader = gitPadFromLeft ( strHeader, "0", 4 );
	str = strHeader + str;

	return str;

}

function runQueuedGitCommand ( inCommand, inData, inRootPath )
{
	var				gitSharedWorker = new SharedWorker ( _getGitSharedWorkerPath ( ), '_gitSharedWorker' );
	if ( typeof ( gitSharedWorker ) == "undefined" || gitSharedWorker == null )
		return null;
		
	var				workerPort = gitSharedWorker. port;
	workerPort. onmessage = function ( inEvent )
	{
		var			message = inEvent. data;
		switch ( message. type )
		{
			case 'runResult':
			{
				var		strResultBase64 = message. strResultBase64;
				var		buffResult;
				if ( strResultBase64. length == 0 )
					buffResult = new Buffer ( 0 );
				else
					buffResult = new Buffer ( strResultBase64, 'base64' );

				_gitAddToBuffer ( buffResult );
					
				//thePort.postMessage({type: 'disconnect', ref: tmRef});
				exitWait ( );
			}
					
			break;
		}
	}
	
	var				strDataBase64 = null;
	if ( inData != null )
	{
		var			nLastIndex = inData. length;
		strDataBase64 = inData. toString ( 'base64', 0, nLastIndex );
	}
	
	workerPort. postMessage ( { type : 'runGitCommand', command : inCommand, dataBase64 : strDataBase64, rootPath : inRootPath } );
	wait ( 30000 );
}


function _userIsAuthorizedForGit ( )
{
	var			bIsAuthorized = false;
	
	var			userPermissions = application. permissions. findResourcePermission ( 'service', 'waf-git-service', 'execute' );
	if ( userPermissions == null )
		// No protection - Access granted
		bIsAuthorized = true;
	else
	{
		var		groupID = userPermissions. groupID;
		bIsAuthorized = application. currentSession ( ). belongsTo ( groupID );
	}
	
	return bIsAuthorized;
}

function _getGitSharedWorkerPath ( )
{
	var			fldr = getWalibFolder ( ). parent. firstFolder;
	while ( fldr. name != "Modules" && fldr. next ( ) )
		;

	fldr = fldr. firstFolder;
	while ( fldr. name != "services" && fldr. next ( ) )
		;

	fldr = fldr. firstFolder;
	while ( fldr. name != "waf-git" && fldr. next ( ) )
		;
		
	return fldr. path + "gitSharedWorker.js";
	
	
}

exports. gitHandler = function _gitHandler ( request, response )
{
	if ( !_userIsAuthorizedForGit ( ) )
	{
		response. statusCode = 401;

		return "User is not authorized";
	}
	
	var			gitWinBinaryPath = "C:\\Program Files (x86)\\Git\\bin\\git.exe"; // TODO: Need to read from global settings
	var			gitRepository = application. storage. getItem ( "waf_git_service.git_dir" );
	if ( typeof ( gitRepository ) == "undefined" || gitRepository == null )
		gitRepository = solution. getFolder ( ). parent. path;
	
	gitBufferSize = 0;

	var			urlQuery = request. urlQuery;

	var			queryParams = {};
	urlQuery. replace (
					new RegExp ( "([^?=&]+)(=([^&]*))?", "g" ),
					function ( $0, $1, $2, $3 ) { queryParams [ $1 ] = $3; } );

	var			gitService = queryParams [ "service" ]; // git-upload-pack for example
	if ( typeof gitService !== "undefined" )
	{
		gitService = gitService. slice ( 4 ); // remove the 'git-' prefix
		var			gitCommand;
		if ( os. isWindows )
			gitCommand = gitWinBinaryPath + " " + gitService + " --stateless-rpc --advertise-refs ";
		else
			gitCommand = "git " + gitService + " --stateless-rpc --advertise-refs ";
		
		gitCommand += gitRepository;

		var			strSmartServerService = "# service=git-" + gitService + "\n";
		strSmartServerService = gitCreateSmartPacket ( strSmartServerService );
		strSmartServerService += "0000"; // smart HTTP flush
		gitBuffer. write ( strSmartServerService, 0, 'utf8' );
		gitBufferSize = strSmartServerService. length; // ASCII 

		runQueuedGitCommand ( gitCommand, null, null );

		response. contentType = "application/x-git-" + gitService + "-advertisement";
		response. allowCache ( false );
		response. headers [ "Expires" ] = "Fri, 01 Jan 1980 00:00:00 GMT";
		response. headers [ "Pragma" ] = "no-cache";
		response. headers [ "Cache-Control" ] = "no-cache, max-age=0, must-revalidate";

		// Create a new buffer with the exact right size
		var			gitResponseBuffer = gitBuffer. slice ( 0, gitBufferSize );
		var			blobResponse = gitResponseBuffer. toBlob ( );
		response. body = blobResponse;

	}
	else if ( request. contentType == "application/x-git-upload-pack-request" && request. rawURL. match ( /git-upload-pack$/ ) )
	{
		var			bodyIn = request. body; // BLOB
//bodyIn = bodyIn. slice ( 0, bodyIn. size - 1 )
		var			bufferIn = bodyIn. toBuffer ( );
//var	strIn = bodyIn. toString ( );
//strIn = bufferIn. toString ( );

		var			gitCommand;
		if ( os. isWindows )
			gitCommand = gitWinBinaryPath + " upload-pack --stateless-rpc ";
		else
			gitCommand = "git upload-pack --stateless-rpc ";
			
		gitCommand += gitRepository;

		gitBufferSize = 0;

		runQueuedGitCommand ( gitCommand, bufferIn, null );

		response. contentType = "application/x-git-upload-pack-result";

		// Create a new buffer with the exact right size
		var			gitResponseBuffer = gitBuffer. slice ( 0, gitBufferSize );
		var			blobResponse = gitResponseBuffer. toBlob ( );
		response. body = blobResponse;		
	}
	else if ( request. contentType == "application/x-git-receive-pack-request" && request. rawURL. match ( /git-receive-pack$/ ) )
	{
		var			bodyIn = request. body; // BLOB
//bodyIn = bodyIn. slice ( 0, bodyIn. size - 1 )
		var			bufferIn = bodyIn. toBuffer ( );
//var	strIn = bodyIn. toString ( );
//strIn = bufferIn. toString ( );

		var			gitCommand;
		if ( os. isWindows )
			gitCommand = gitWinBinaryPath + " receive-pack --stateless-rpc ";
		else
			gitCommand = "git receive-pack --stateless-rpc ";
		
		gitCommand += gitRepository;

		gitBufferSize = 0;

		runQueuedGitCommand ( gitCommand, bufferIn, null );

		// Needed to make push work on non-bare repositories
		if ( os. isWindows )
			gitCommand = gitWinBinaryPath + ' --git-dir=' + gitRepository + '\\.git --work-tree=' + gitRepository + ' checkout -f';
		else
		{
//gitCommand = 'git --git-dir=' + gitRepository + '\\.git --work-tree=' + gitRepository + ' checkout -f';
			gitCommand = 'bash -c "git --git-dir=\'' + gitRepository + '\\.git\' --work-tree=\'' + gitRepository + '\' checkout -f"';
		}
		
		runQueuedGitCommand ( gitCommand, null, gitRepository );

		response. contentType = "application/x-git-receive-pack-result";

		// Create a new buffer with the exact right size
		var			gitResponseBuffer = gitBuffer. slice ( 0, gitBufferSize );
		var			blobResponse = gitResponseBuffer. toBlob ( );
		response. body = blobResponse;		
	}
	else if ( request. rawURL. indexOf ( "gitservice/repo/init" ) != -1 )
	{
		var				gitNewRepositoryPath = queryParams [ "path" ];
		if ( gitNewRepositoryPath [ gitNewRepositoryPath. length - 1 ] != "/" )
			gitNewRepositoryPath += "/";
			
		var				fldrNewRepository = new File ( process. userDocuments, gitNewRepositoryPath + "s.txt" );
		if ( fldrNewRepository == null )
		{
			return "Error: Invalid path";
		}
			
		gitNewRepositoryPath = fldrNewRepository. parent. path;
		
		// TODO: Need to use the waf-git module
		// TODO: Need to handle git path installation on Windows
		var				gitCommand;
		if ( os. isWindows )
			gitCommand = gitWinBinaryPath + " init " + gitNewRepositoryPath;
		else
			gitCommand = "git init " + gitNewRepositoryPath;
		/*if ( os. isWindows )
		{
			inFolderPath = '"' + inFolderPath + '"';
			gitCommand = _gitExecPath + " init " + inFolderPath;
		}
		else if ( os. isMac )
		{
			inFolderPath = "'" + inFolderPath + "'";
			gitCommand = 'bash -c "git' + ' init ' + inFolderPath + ' 2>&1"';
		}
		else
			debug_alert ( "Error: unknown OS" );
		*/
		

		var				gitResponseBuffer = null;
		var				strResponse1 = "";
		
		runQueuedGitCommand ( gitCommand, null, null );

		gitResponseBuffer = gitBuffer. slice ( 0, gitBufferSize );
		var			strResponse1 = gitResponseBuffer. toString ( ) + " SEPARATOR ";


		// This is needed to be able to push remotely over HTTP into a non-bare repository
		if ( os. isWindows )
			gitCommand = gitWinBinaryPath + ' --git-dir=' + gitNewRepositoryPath + '/.git --work-tree=' + gitNewRepositoryPath + '/ config receive.denyCurrentBranch ignore';
		else
			gitCommand = 'bash -c "git --git-dir=\'' + gitNewRepositoryPath + '/.git\' --work-tree=\'' + gitNewRepositoryPath + '/\' config receive.denyCurrentBranch ignore"';
			
		gitBufferSize = 0;
		runQueuedGitCommand ( gitCommand, null, null );
		
		gitResponseBuffer = gitBuffer. slice ( 0, gitBufferSize );
		var			strResponse2 = gitResponseBuffer. toString ( ) + " SEPARATOR ";
		
		// TODO: Error handling
		
		return "OK";
	}
	else if ( request. rawURL. indexOf ( "gitservice/repo/dir" ) != -1 )
	{
		// This URL is supposed to be called by one persone to change the current repository root.
		// Wakanda git service is not multi-repository at the moment so use this call with care.
		
		var				gitNewRepositoryPath = queryParams [ "path" ];
		if ( typeof ( gitNewRepositoryPath ) != "undefined" && gitNewRepositoryPath != null )
		{
			var			strFilePath = gitNewRepositoryPath;
			if ( strFilePath [ strFilePath. length - 1 ] != "/" )
				strFilePath += "/";
				
			strFilePath += "s.txt";
				
			var				strResponse = "";
			var				fldrNewRoot = new File ( process. userDocuments, strFilePath );
			if ( fldrNewRoot == null )
			{
				strResponse = "Error: Invalid path";
			}
			else
			{
				gitNewRepositoryPath = fldrNewRoot. parent. path;
			
				var				allApps = solution. applications;
				for ( var i = 0; i < allApps. length; i++ )
					allApps [ i ]. storage. setItem ( "waf_git_service.git_dir", gitNewRepositoryPath );
				
				strResponse = "OK Set git directory to " + gitNewRepositoryPath;
			}
		
			return strResponse;
		}
		else
		{
			var			fldr = getWalibFolder ( ). parent. firstFolder;
			while ( fldr. name != "Modules" && fldr. next ( ) )
				;
				
			fldr = fldr. firstFolder;
			while ( fldr. name != "services" && fldr. next ( ) )
				;
				
			fldr = fldr. firstFolder;
			while ( fldr. name != "waf-git" && fldr. next ( ) )
				;

			return gitRepository; // + " and user documents are at " + process. userDocuments. path;
		}
	}
	else
	{
		return solution. getFolder ( ). parent. path;
	}
}


function addGitPatterns ( )
{
	application. addHttpRequestHandler ( '/gitservice/repo/git-upload-pack', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. addHttpRequestHandler ( '/gitservice/repo/git-receive-pack', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. addHttpRequestHandler ( '/gitservice/repo/HEAD', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. addHttpRequestHandler ( '/gitservice/repo/objects', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. addHttpRequestHandler ( '/gitservice/repo/git', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. addHttpRequestHandler ( '/gitservice/repo/info/refs', 'services/waf-git/waf-GitService', 'gitHandler' );
	
	application. addHttpRequestHandler ( '/gitservice/repo/init', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. addHttpRequestHandler ( '/gitservice/repo/dir', 'services/waf-git/waf-GitService', 'gitHandler' );
	
	//application. addHttpRequestHandler ( '/gitservice/test', 'services/waf-git', 'gitHandler' );

	//addHttpRequestHandler ( '/objects/info/alternates', 'services/waf-git', 'gitHandler' );
	//addHttpRequestHandler ( '/objects/info/http-alternates', 'services/waf-git', 'gitHandler' );
	//addHttpRequestHandler ( '/objects/info/packs', 'services/waf-git', 'gitHandler' );
	//addHttpRequestHandler ( '/objects/info/[^/]*', 'services/waf-git', 'gitHandler' );
	//addHttpRequestHandler ( '/objects/[0-9a-f]{2}/[0-9a-f]{38}', 'services/waf-git', 'gitHandler' );
	//addHttpRequestHandler ( '/objects/pack/pack-[0-9a-f]{40}\\.pack', 'services/waf-git', 'gitHandler' );
	//addHttpRequestHandler ( '/objects/pack/pack-[0-9a-f]{40}\\.idx', 'services/waf-git', 'gitHandler' );
}

function removeGitPatterns ( )
{
	application. removeHttpRequestHandler ( '/gitservice/repo/git-upload-pack', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. removeHttpRequestHandler ( '/gitservice/repo/git-receive-pack', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. removeHttpRequestHandler ( '/gitservice/repo/HEAD', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. removeHttpRequestHandler ( '/gitservice/repo/objects', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. removeHttpRequestHandler ( '/gitservice/repo/git', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. removeHttpRequestHandler ( '/gitservice/repo/info/refs', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. removeHttpRequestHandler ( '/gitservice/test', 'services/waf-git/waf-GitService', 'gitHandler' );
	
	application. removeHttpRequestHandler ( '/gitservice/repo/init', 'services/waf-git/waf-GitService', 'gitHandler' );
	application. removeHttpRequestHandler ( '/gitservice/repo/dir', 'services/waf-git/waf-GitService', 'gitHandler' );
}

exports. postMessage = function ( inMessage ) {
   
	if ( inMessage. name === "applicationWillStart" )
	{
	}
	else if ( inMessage. name === "applicationWillStop" )
	{
	}
	else if ( inMessage. name === "httpServerWillStop" )
	{
		removeGitPatterns ( );
	}
	else if ( inMessage. name === "httpServerDidStart" )
	{
		addGitPatterns ( );
	}
	else if ( inMessage. name === "catalogWillReload" )
	{
	}
	else if ( inMessage. name === "catalogDidReload" )
	{
	}		
};
