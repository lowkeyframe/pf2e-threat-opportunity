// pf2e-threat-opportunity.js

/**
 * Main entry point for the PF2e Threat & Opportunity module.
 * This script registers hooks and functions to add custom details to dice rolls.
 */
Hooks.on('init', () => {
    console.log("PF2e Threat & Opportunity | Initializing module...");

    // Removed threatMargin and opportunityMargin settings as they are no longer used
    // with the new fixed-value threat/opportunity logic.

    console.log("PF2e Threat & Opportunity | Module initialized.");
});

/**
 * Hook into the ChatMessage rendering process to add custom threat/opportunity details.
 * This function will run whenever a ChatMessage is rendered in the chat log.
 * @param {ChatMessage} message The ChatMessage object being rendered.
 * @param {JQuery} html The jQuery object representing the HTML content of the message.
 * @param {Object} data The data associated with the message rendering.
 */
Hooks.on('renderChatMessage', async (message, html, data) => {
    // Only process messages that contain a dice roll and originate from the PF2e system.
    // Also, ensure the message has not been processed by this module before to prevent duplicates.
    const isPf2eRoll = message.isRoll && message.rolls.length > 0 && message.flags?.pf2e;
    const hasAlreadyProcessed = message.getFlag("pf2e-threat-opportunity", "processed");

    if (!isPf2eRoll || hasAlreadyProcessed) {
        return;
    }

    const roll = message.rolls[0]; // Assuming the first roll is the primary one
    const rollTotal = roll.total;

    // Attempt to extract the DC from the PF2e context flags.
    const context = message.flags.pf2e.context;

    // --- NEW: Filter rolls to apply only to skill checks ---
    const isSkillCheck = context?.type === "skill-check";
    const isAttackRoll = context?.type === "attack" ||
                         (context?.options && (context.options.includes("action:strike") || context.options.includes("action:attack-roll")));
    const isSavingThrow = context?.type === "save";

    // If it's not a skill check, or if it's an attack roll or saving throw, skip processing.
    if (!isSkillCheck || isAttackRoll || isSavingThrow) {
        // console.debug(`PF2e Threat & Opportunity | Skipping non-skill roll (type: ${context?.type}).`);
        return;
    }
    // --- END NEW FILTER ---

    let dc = null;

    if (context?.dc?.value) {
        // This covers most skill checks
        dc = context.dc.value;
    } else if (context?.roll?.options?.includes("dc")) {
        // Sometimes the DC is passed via options, e.g., for custom rolls
        const dcOption = context.roll.options.find(opt => opt.startsWith("dc:"));
        if (dcOption) {
            dc = parseInt(dcOption.split(":")[1]);
        }
    }

    if (dc === null) {
        // If no DC could be automatically determined, log a message and exit.
        console.debug(`PF2e Threat & Opportunity | No DC found for skill check message ${message.id}. Skipping.`);
        return;
    }

    let detailText = "";
    let detailClass = "";

    // Calculate the difference between the roll total and the DC
    const difference = rollTotal - dc;

    // --- NEW: Implement the custom threat and opportunity behavior ---
    // Opportunity conditions:
    // if dc -1 to -3 (difference: -1, -2, -3)
    // if dc +7 to +9 (difference: 7, 8, 9)
    if ([-1, -2, -3].includes(difference) || [7, 8, 9].includes(difference)) {
        detailText = game.i18n.localize("OPPORTUNITY"); // Assuming localization key exists or will be added
        detailClass = "opportunity";
    }
    // Threat conditions:
    // if dc -7 to -9 (difference: -7, -8, -9)
    // if = dc or +2 (difference: 0, 2)
    else if ([-7, -8, -9].includes(difference) || [0, 2].includes(difference)) {
        detailText = game.i18n.localize("THREAT"); // Assuming localization key exists or will be added
        detailClass = "threat";
    }
    // --- END NEW LOGIC ---

    // If a detail was determined, update the chat message's content to persist it.
    if (detailText) {
        // Construct the HTML for the detail to be appended
        const newDetailHtml = `
            <div class="pf2e-threat-opportunity-detail ${detailClass}">
                
                <span>${detailText}</span>
            </div>
        `;

        // Update the message's content. We need to parse the existing content, append our new HTML, and then save.
        // Use a temporary div to parse the existing HTML to avoid issues with invalid HTML strings.
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = message.content;

        const messageContentDiv = tempDiv.querySelector('.message-content');
        if (messageContentDiv) {
            messageContentDiv.insertAdjacentHTML('beforeend', newDetailHtml);
        } else {
            // Fallback if .message-content is not found (unlikely for PF2e rolls)
            tempDiv.innerHTML += newDetailHtml;
        }

        const updatedContent = tempDiv.innerHTML;

        // Set the processed flag BEFORE updating the message to prevent re-entry of the hook.
        message.setFlag("pf2e-threat-opportunity", "processed", true);

        // Update the message in the database.
        await message.update({ content: updatedContent });

        console.log(`PF2e Threat & Opportunity | Persisted '${detailText}' to message ${message.id}.`);
    }
});
