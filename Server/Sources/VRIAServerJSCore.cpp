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
#include "headers4d.h"
#include "VSolutionStartupParameters.h"
#include "VRIAServerApplication.h"
#include "VRIAServerSolution.h"
#include "VRIAServerProject.h"
#include "VRIAServerJSContextMgr.h"
#include "VRPCService.h"
#include "VJSRPCServiceCore.h"
#include "VDataService.h"
#include "VJSDataServiceCore.h"
#include "VJSWebAppServiceCore.h"
#include "VRIAServerJSCore.h"
#include "VJSSolution.h"
#include <../../JavaScriptCore/4D/4DDebuggerServer.h>


USING_TOOLBOX_NAMESPACE



void VRIAServerJSCore::Initialize( const VJSParms_initialize& inParms, VRIAServerProject* inApplication)
{
	if (inApplication != NULL)
	{
		inApplication->Retain();

		VJSObject object( inParms.GetObject());
		
		VError err = VE_OK;
		VRIAContext *riaContext = VRIAJSRuntimeContext::GetApplicationContextFromJSContext( inParms.GetContext(), inApplication);
		
		// Append the 'rpcService' property
		VRPCService *rpcService = inApplication->RetainRPCService( riaContext, &err);
		if ((rpcService != NULL) && (err == VE_OK))
		{
			object.SetProperty( L"rpcService", VJSRPCServiceCore::CreateInstance( inParms.GetContext(), rpcService), JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontEnum | JS4D::PropertyAttributeDontDelete);
		}
		ReleaseRefCountable( &rpcService);
		
		// Append the 'dataStoreService' property
		VDataService *dataService = inApplication->RetainDataService( riaContext, &err);
		if ((dataService != NULL) && (err == VE_OK))
		{
			object.SetProperty( L"dataStoreService", VJSDataServiceCore::CreateInstance( inParms.GetContext(), dataService), JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontEnum | JS4D::PropertyAttributeDontDelete);
		}
		ReleaseRefCountable( &dataService);

		// Append the 'webAppService' property
		object.SetProperty( L"webAppService", VJSWebAppServiceCore::CreateInstance( inParms.GetContext(), inApplication), JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontEnum | JS4D::PropertyAttributeDontDelete);
	}
}


void VRIAServerJSCore::Finalize( const VJSParms_finalize& inParms, VRIAServerProject* inApplication)
{
	if (inApplication != NULL)
	{
		inApplication->Release();
	}
}


void VRIAServerJSCore::GetDefinition( ClassDefinition& outDefinition)
{
	static inherited::StaticFunction functions[] =
	{
		{ "openSolution", js_callStaticFunction<_openSolution>, JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontDelete },
		{ "recentlyOpenedSolution", js_callStaticFunction<_getRecentSolution>, JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontDelete },
		{ "setDebuggerServer", js_callStaticFunction<_setDebuggerServer>, JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontDelete },
		{ "getDebuggerServer", js_callStaticFunction<_getDebuggerServer>, JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontDelete },
		{ 0, 0, 0}
	};
	
	outDefinition.className = "ServerCore";
	outDefinition.initialize = js_initialize<Initialize>;
	outDefinition.finalize = js_finalize<Finalize>;
	outDefinition.staticFunctions = functions;
}


void VRIAServerJSCore::_setDebuggerServer( XBOX::VJSParms_callStaticFunction& ioParms, VRIAServerProject* inApplication)
{
#if 1//defined(WKA_USE_UNIFIED_DBG)
	if (!inApplication)
	{
		ioParms.ReturnUndefinedValue();
		return;
	}

	VRIAContext* riaContext = VRIAJSRuntimeContext::GetApplicationContextFromJSContext(ioParms.GetContext(), inApplication);

	sLONG	l_dbg_type;
	DebugMsg("\n\n !!!! \n VRIAServerJSCore::_setDebuggerServer CALLED!!!!!\n\n\n");
	if (ioParms.GetLongParam( 1, &l_dbg_type ))
	{
		WAKDebuggerType_t	l_type = REGULAR_DBG_TYPE;
		if (l_dbg_type)
		{
			l_type = WEB_INSPECTOR_TYPE;
		}
		if (!inApplication->SetDebuggerServer(riaContext,l_type))
		{
			ioParms.ReturnNullValue();
		}
		else
		{
			ioParms.ReturnUndefinedValue();
		}
	}
	else
	{
		ioParms.ReturnUndefinedValue();
	}

#else
	{
		ioParms.ReturnUndefinedValue();
	}
#endif
}

void VRIAServerJSCore::_getDebuggerServer( XBOX::VJSParms_callStaticFunction& ioParms, VRIAServerProject* inApplication)
{
	if (!inApplication)
	{
		ioParms.ReturnUndefinedValue();
		return;
	}

	VRIAContext* riaContext = VRIAJSRuntimeContext::GetApplicationContextFromJSContext(ioParms.GetContext(), inApplication);

	ioParms.ReturnNumber( inApplication->GetDebuggerServer(riaContext) );
}

void VRIAServerJSCore::_openSolution( XBOX::VJSParms_callStaticFunction& ioParms, VRIAServerProject* inApplication)
{
	bool done = false;
	VString jsPath;
	VJSObject jsFile( ioParms.GetContext());
	sLONG openingMode = 0;

	VFile *paramFile = ioParms.RetainFileParam( 1, true);
	if (paramFile != NULL && ioParms.GetLongParam( 2, &openingMode))
	{
		VSolutionStartupParameters *startupParams = NULL;

		if (paramFile->Exists())
		{
			if (paramFile->ConformsTo(RIAFileKind::kSolutionFileKind))
			{
				startupParams = new VSolutionStartupParameters();
				if (startupParams != NULL)	
					startupParams->SetSolutionFileToOpen( paramFile);
			}
			else if (paramFile->ConformsTo( RIAFileKind::kSolutionLinkFileKind))
			{
				startupParams = new VSolutionStartupParameters();
				if (startupParams != NULL)
				{
					if (LoadSolutionStartupParametersFromLinkFile( *paramFile, *startupParams) != VE_OK)
						ReleaseRefCountable( &startupParams);
				}
			}
		}

		if (startupParams != NULL)
		{
			startupParams->SetOpenProjectSymbolsTable( false);	// sc 25/05/2012, on Server, do not use the symbols table anymore
			
			VRIAServerSolutionOpeningParameters openingParams( startupParams);

			if (openingMode == 1)
			{
				openingParams.SetOpeningMode( eSOM_FOR_RUNNING);
				openingParams.UpdateStartupParameters( startupParams);
				VRIAServerApplication::Get()->OpenSolutionAsCurrentSolution( startupParams);
				ioParms.ReturnNullValue();
				done = true;
			}
			else if (openingMode == 2)
			{
				VError err = VE_OK;
				openingParams.SetOpeningMode( eSOM_FOR_MAINTENANCE);
				openingParams.UpdateStartupParameters( startupParams);
				VRIAServerSolution *solution = VRIAServerApplication::Get()->OpenAndRetainSolutionForMaintenance( err, startupParams);
				if (solution != NULL)
				{
					VRIAJSRuntimeContext *rtContext = VRIAJSRuntimeContext::GetFromJSContext( ioParms.GetContext());
					if (rtContext != NULL)
					{
						rtContext->AttachSolution( ioParms.GetContext(), solution);
					}

					ioParms.ReturnValue( VJSSolution::CreateInstance( ioParms.GetContextRef(), solution));
					ReleaseRefCountable( &solution);
					done = true;
				}
			}
			startupParams->Release();
		}
	}

	ReleaseRefCountable( &paramFile);

	if (!done)
	{
		ioParms.ReturnUndefinedValue();
	}
}


void VRIAServerJSCore::_getRecentSolution( XBOX::VJSParms_callStaticFunction& ioParms, VRIAServerProject* inApplication)
{
	VJSArray result( ioParms.GetContextRef());

	TimeToStringsPairMultimap recentSolutions;
	GetMapOfRecentSolutionFiles( recentSolutions);

	TimeToStringsPairMultimap::reverse_iterator iter = recentSolutions.rbegin();
	while (iter != recentSolutions.rend()) 
	{
		VSolutionStartupParameters *solutionParams = new VSolutionStartupParameters();
		if (solutionParams != NULL)
		{
			solutionParams->SetOpenProjectSymbolsTable( false);	// sc 25/05/2012, on Server, do not use the symbols table anymore

			VFile *linkFile = new VFile( iter->second.second);
			if (linkFile != NULL)
			{
				if (LoadSolutionStartupParametersFromLinkFile( *linkFile, *solutionParams) == VE_OK)
				{
					VFile *solutionFile = solutionParams->GetSolutionFileToOpen();
					if (solutionFile != NULL)
					{
						VJSValue jsSolutionFile( ioParms.GetContext());
						jsSolutionFile.SetFile( solutionFile);

						VJSValue jsLinkFile( ioParms.GetContext());
						jsLinkFile.SetFile( linkFile);

						VJSObject recentSolution( ioParms.GetContext());
						recentSolution.MakeEmpty();
						recentSolution.SetProperty( L"name", iter->second.first);
						recentSolution.SetProperty( L"solutionFile", jsSolutionFile);
						recentSolution.SetProperty( L"linkFile", jsLinkFile);
						result.PushValue( recentSolution);
					}
				}
				ReleaseRefCountable( &linkFile);
			}
			ReleaseRefCountable( &solutionParams);
		}
		++iter;
	}

	ioParms.ReturnValue( result);
}

