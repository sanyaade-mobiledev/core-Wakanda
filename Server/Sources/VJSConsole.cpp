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
#include "VRIAServerProject.h"
#include "VRIAServerLogger.h"
#include "VRIAServerJSAPI.h"
#include "JavaScript/Sources/VJSJSON.h"
#include "VRIAServerJSContextMgr.h"
#include "VJSConsole.h"



USING_TOOLBOX_NAMESPACE



void VJSConsole::Initialize( const VJSParms_initialize& inParms, VRIAServerProject* inApplication)
{
	if (inApplication != NULL)
		inApplication->Retain();
}


void VJSConsole::Finalize( const VJSParms_finalize& inParms, VRIAServerProject* inApplication)
{
	if (inApplication != NULL)
		inApplication->Release();
}


void VJSConsole::GetDefinition( ClassDefinition& outDefinition)
{
	static inherited::StaticFunction functions[] =
	{
		{ "log", js_callStaticFunction<_log>, JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontDelete },
		{ "debug", js_callStaticFunction<_debug>, JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontDelete },
		{ "info", js_callStaticFunction<_info>, JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontDelete },
		{ "warn", js_callStaticFunction<_warn>, JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontDelete },
		{ "error", js_callStaticFunction<_error>, JS4D::PropertyAttributeReadOnly | JS4D::PropertyAttributeDontDelete },
		{ 0, 0, 0}
	};
	
	outDefinition.className = kSSJS_CLASS_NAME_Console;
	outDefinition.initialize = js_initialize<Initialize>;
	outDefinition.finalize = js_finalize<Finalize>;
	outDefinition.getProperty = js_getProperty<GetProperty>;
	outDefinition.getPropertyNames = js_getPropertyNames<GetPropertyNames>;
	outDefinition.staticFunctions = functions;
}


void VJSConsole::GetProperty( VJSParms_getProperty& ioParms, VRIAServerProject* inApplication)
{
	VString propertyName;

	ioParms.GetPropertyName( propertyName);
	if (propertyName.EqualToString( L"content", true))
	{
		VJSArray result( ioParms.GetContextRef());

		if (inApplication != NULL)
		{
			VLog4jMsgFileReader *reader = inApplication->GetMessagesReader();
			if (reader != NULL)
			{
				VectorOfVString messages;

				reader->PeekMessages( messages);

				for( VectorOfVString::iterator iter = messages.begin() ; iter != messages.end() ; ++iter)
				{
					VJSValue jsValue( ioParms.GetContextRef());
					jsValue.SetString( *iter);
					result.PushValue( jsValue);
				}
			}
		}

		ioParms.ReturnValue( result);
	}
}


void VJSConsole::GetPropertyNames( VJSParms_getPropertyNames& ioParms, VRIAServerProject* inApplication)
{
	ioParms.AddPropertyName( L"content");
}


void VJSConsole::_log( VJSParms_callStaticFunction& ioParms, VRIAServerProject* inApplication)
{
	// sc 16/01/2012, use eL4JML_Information level instead of eL4JML_Trace level (by default, eL4JML_Trace level if filtered by the logger)
	_LogParms( ioParms, inApplication, eL4JML_Information);
}


void VJSConsole::_debug( VJSParms_callStaticFunction& ioParms, VRIAServerProject* inApplication)
{
	// TBD: append debug information (file name and line number)
	_LogParms( ioParms, inApplication, eL4JML_Debug);
}


void VJSConsole::_info( VJSParms_callStaticFunction& ioParms, VRIAServerProject* inApplication)
{
	_LogParms( ioParms, inApplication, eL4JML_Information);
}


void VJSConsole::_warn( VJSParms_callStaticFunction& ioParms, VRIAServerProject* inApplication)
{
	_LogParms( ioParms, inApplication, eL4JML_Warning);
}


void VJSConsole::_error( VJSParms_callStaticFunction& ioParms, VRIAServerProject* inApplication)
{
	_LogParms( ioParms, inApplication, eL4JML_Error);
}


void VJSConsole::_LogParms( VJSParms_callStaticFunction& ioParms, VRIAServerProject* inApplication, const ELog4jMessageLevel& inLevel)
{
	VString message, loggerID;
	VJSONArrayWriter jsonParamsArray;
	
	if (ioParms.CountParams() > 0)
	{
		size_t parmsCount = ioParms.CountParams(), parmsConsumed = 0;
		VJSJSON xjson( ioParms.GetContextRef());
		VString strVal;

		while (parmsConsumed < parmsCount)
		{
			if (ioParms.IsStringParam(parmsConsumed + 1))
			{
				ioParms.GetStringParam( parmsConsumed + 1, strVal);
				++parmsConsumed;

				if (parmsConsumed == 1)
				{
					// it's the first parameter
					VIndex strPos = strVal.FindUniChar( CHAR_PERCENT_SIGN);
					if (strPos > 0)
					{
						VString strFormat( strVal), staticString;
						VIndex staticStringPos = 1;

						while ((strPos > 0) && (strPos < strFormat.GetLength()) && (parmsConsumed < parmsCount))
						{
							strFormat.GetSubString( staticStringPos, strPos - staticStringPos, staticString);
							if (!staticString.IsEmpty())
								jsonParamsArray.AddString( staticString, JSON_WithQuotesIfNecessary | JSON_AlreadyEscapedChars);

							UniChar fchar = strFormat.GetUniChar( strPos + 1);
							if (fchar == 'd')
							{
								sLONG value = 0;
								ioParms.GetLongParam( parmsConsumed + 1, &value);
								++parmsConsumed;

								strVal.Printf( "%d", value);
								strFormat.Replace( strVal, strPos, 2);
								strPos += strVal.GetLength();

								jsonParamsArray.AddLong( value);
							}
							else if (fchar == 'i')
							{
								sLONG value = 0;
								ioParms.GetLongParam( parmsConsumed + 1, &value);
								++parmsConsumed;

								strVal.Printf( "%i", value);
								strFormat.Replace( strVal, strPos, 2);
								strPos += strVal.GetLength();

								jsonParamsArray.AddLong( value);
							}
							else if (fchar == 'f')
							{
								Real value = 0.0;
								ioParms.GetRealParam( parmsConsumed + 1, &value);
								++parmsConsumed;

								strVal.Printf( "%f", value);
								strFormat.Replace( strVal, strPos, 2);
								strPos += strVal.GetLength();

								jsonParamsArray.AddReal( value);
							}
							else if (fchar == 'o')
							{
								++parmsConsumed;
								VJSValue value = ioParms.GetParamValue( parmsConsumed);

								JS4D::ExceptionRef exceptionRef = NULL;
								xjson.Stringify( value, strVal, &exceptionRef);

								if (exceptionRef != NULL)
								{
									// strVal contains the description of the exception
									strVal.Insert( L"new Error(\"", 1);
									strVal.AppendString( "\")");
								}

								strFormat.Replace( strVal, strPos, 2);
								strPos += strVal.GetLength();

								jsonParamsArray.AddString( strVal, JSON_AlreadyEscapedChars);
							}
							else
							{
								// if fchar is 's' or any other character, take the value as a string
								ioParms.GetStringParam( parmsConsumed + 1, strVal);
								++parmsConsumed;

								strFormat.Replace( strVal, strPos, 2);
								strPos += strVal.GetLength();

								jsonParamsArray.AddString( strVal, JSON_WithQuotesIfNecessary | JSON_AlreadyEscapedChars);
							}

							staticStringPos = strPos;

							if (strPos <= strFormat.GetLength())
								strPos = strFormat.FindUniChar( CHAR_PERCENT_SIGN, strPos);
						}

						if (staticStringPos <= strFormat.GetLength())
						{
							strFormat.GetSubString( staticStringPos, strFormat.GetLength() - staticStringPos + 1, staticString);
							jsonParamsArray.AddString( staticString, JSON_WithQuotesIfNecessary | JSON_AlreadyEscapedChars);
						}
											
						strVal.FromString( strFormat);
					}
					else
					{
						jsonParamsArray.AddString( strVal, JSON_WithQuotesIfNecessary | JSON_AlreadyEscapedChars);
					}
				}
				else
				{
					jsonParamsArray.AddString( strVal, JSON_WithQuotesIfNecessary | JSON_AlreadyEscapedChars);
				}
			}
			else if (ioParms.IsNumberParam( parmsConsumed + 1))
			{
				ioParms.GetStringParam( parmsConsumed + 1, strVal);

				Real value = 0.0;
				ioParms.GetRealParam( parmsConsumed + 1, &value);
				jsonParamsArray.AddReal( value);

				++parmsConsumed;
			}
			else if(ioParms.IsBooleanParam( parmsConsumed + 1))
			{
				ioParms.GetStringParam( parmsConsumed + 1, strVal);

				bool value = false;
				ioParms.GetBoolParam( parmsConsumed + 1, &value);
				jsonParamsArray.AddBool( value);

				++parmsConsumed;
			}
			else
			{
				VJSValue value = ioParms.GetParamValue( parmsConsumed + 1);

				JS4D::ExceptionRef exceptionRef = NULL;
				xjson.Stringify( value, strVal, &exceptionRef);

				if (exceptionRef != NULL)
				{
					// strVal contains the description of the exception
					strVal.Insert( L"new Error(\"", 1);
					strVal.AppendString( "\")");
				}

				jsonParamsArray.AddString( strVal, JSON_AlreadyEscapedChars);

				++parmsConsumed;
			}
			
			if (!message.IsEmpty())
				message.AppendUniChar( ' ');

			message.AppendString( strVal);
		}
	}
	
	if (inApplication != NULL)
	{
		// append json formatted message for debugger
		VString strArray, jsonObjectString;
		VJSONSingleObjectWriter object;

		jsonParamsArray.GetArray( strArray, false);
		object.AddMember( L"data", strArray, JSON_AlreadyEscapedChars);
		object.GetObject( jsonObjectString);

		StUseLogger logger;
		inApplication->GetMessagesLoggerID( loggerID);
		logger.Log( loggerID, inLevel, jsonObjectString);
		loggerID.AppendString( L".console");
		logger.Log( loggerID, inLevel, jsonObjectString);
	}
	else
	{
		message.AppendUniChar( L'\n');
		StStringConverter<char> stringConverter( VTC_StdLib_char);
		fputs( stringConverter.ConvertString( message), stdout);
	}
}