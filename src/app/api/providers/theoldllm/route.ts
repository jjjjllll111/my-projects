import { NextResponse } from "next/server";
import { getProviderConnections, updateProviderConnection, createProviderConnection } from "@/models";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

/**
 * PUT /api/providers/theoldllm - Update theoldllm provider configuration
 * 
 * For this no-auth provider, we auto-create a default connection if none exists,
 * then store the providerSpecificData on that connection so the routing system
 * can access it.
 */
export async function PUT(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { providerSpecificData } = body;

    if (!providerSpecificData || typeof providerSpecificData !== "object") {
      return NextResponse.json(
        { error: "providerSpecificData is required and must be an object" },
        { status: 400 }
      );
    }

    // Get all theoldllm connections
    const allConnections = await getProviderConnections();
    let theoldllmConnections = allConnections.filter(
      (conn) => conn.provider === "theoldllm"
    );

    // If no connections exist, auto-create a default one for this no-auth provider
    if (theoldllmConnections.length === 0) {
      const newConnection = await createProviderConnection({
        provider: "theoldllm",
        name: "TheOldLLM (Default)",
        priority: 1,
        authType: "none",
        providerSpecificData,
      });
      
      if (newConnection) {
        theoldllmConnections = [newConnection];
      }
    } else {
      // Update existing connections with the new providerSpecificData
      for (const connection of theoldllmConnections) {
        const updatedProviderSpecificData = {
          ...(connection.providerSpecificData || {}),
          ...providerSpecificData,
        };

        await updateProviderConnection(connection.id, {
          providerSpecificData: updatedProviderSpecificData,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `TheOldLLM配置已保存`,
      updatedCount: theoldllmConnections.length,
      autoCreated: theoldllmConnections.length === 1 && theoldllmConnections[0].name === "TheOldLLM (Default)",
    });
  } catch (error) {
    console.error("[API] PUT /api/providers/theoldllm error:", error);
    return NextResponse.json(
      { error: "Failed to update provider configuration" },
      { status: 500 }
    );
  }
}
