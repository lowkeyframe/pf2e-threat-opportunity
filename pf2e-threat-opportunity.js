// pf2e-threat-opportunity.js

/**
 * Main entry point for the PF2e Threat & Opportunity module.
 * This script registers hooks and functions to add custom details to dice rolls.
 */
Hooks.on('init', () => {
    console.log("PF2e Threat & Opportunity | Initializing module...");

    // Register module settings (optional, but good practice for future configurability)
    game.settings.register("pf2e-threat-opportunity", "threatMargin", {
        name: game.i18n.localize("PF2E_THREAT_OPPORTUNITY.SettingThreatMargin"),
        hint: game.i18n.localize("PF2E_THREAT_OPPORTUNITY.SettingThreatMarginHint"),
        scope: "world",
        config: true,
        type: Number,
        default: 5,
        range: {
            min: 1,
            max: 10,
            step: 1
        }
    });

    game.settings.register("pf2e-threat-opportunity", "opportunityMargin", {
        name: game.i18n.localize("PF2E_THREAT_OPPORTUNITY.SettingOpportunityMargin"),
        hint: game.i18n.localize("PF2E_THREAT_OPPORTUNITY.SettingOpportunityMarginHint"),
        scope: "world",
        config: true,
        type: Number,
        default: 5,
        range: {
            min: 1,
            max: 10,
            step: 1
        }
    });

    console.log("PF2e Threat & Opportunity | Settings registered.");
});

/**
 * Hook into the ChatMessage rendering process to add custom threat/opportunity details.
 * This function will run whenever a ChatMessage is rendered in the chat log.
 * @param {ChatMessage} message The ChatMessage object being rendered.
 * @param {JQuery} html The jQuery object representing the HTML content of the message.
 * @param {Object} data The data associated with the message rendering.
 */
Hooks.on('renderChatMessage', (message, html, data) => {
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
    // Common paths for DC in PF2e messages:
    // - Attack rolls (target AC): flags.pf2e.context.dc.value
    // - Skill checks/Saves: flags.pf2e.context.dc.value
    const context = message.flags.pf2e.context;
    let dc = null;

    if (context?.dc?.value) {
        // This covers most skill checks and saves
        dc = context.dc.value;
    } else if (context?.type === "attack" && context?.target?.ac) {
        // This covers attack rolls against a target's AC
        dc = context.target.ac;
    } else if (context?.roll?.options?.includes("dc")) {
        // Sometimes the DC is passed via options, e.g., for custom rolls
        const dcOption = context.roll.options.find(opt => opt.startsWith("dc:"));
        if (dcOption) {
            dc = parseInt(dcOption.split(":")[1]);
        }
    }

    if (dc === null) {
        // If no DC could be automatically determined, log a message and exit.
        // This module does not provide a UI for manual DC input to keep it focused on auto-detection.
        console.debug(`PF2e Threat & Opportunity | No DC found for message ${message.id}. Skipping.`);
        return;
    }

    const threatMargin = game.settings.get("pf2e-threat-opportunity", "threatMargin");
    const opportunityMargin = game.settings.get("pf2e-threat-opportunity", "opportunityMargin");

    let detailText = "";
    let detailClass = "";

    // Determine if it's a threat or an opportunity based on the criteria.
    // Threat: Roll is greater than or equal to DC, and within threatMargin of DC.
    // Opportunity: Roll is less than DC, and within opportunityMargin of DC.
    if (rollTotal >= dc && (rollTotal - dc <= threatMargin)) {
        detailText = game.i18n.localize("PF2E_THREAT_OPPORTUNITY.Threat");
        detailClass = "threat";
    } else if (rollTotal < dc && (dc - rollTotal <= opportunityMargin)) {
        detailText = game.i18n.localize("PF2E_THREAT_OPPORTUNITY.Opportunity");
        detailClass = "opportunity";
    }

    // If a detail was determined, append it to the chat message.
    if (detailText) {
        const chatContent = html.find(".message-content");
        if (chatContent.length) {
            // Append the new detail div after the main roll result, but within the message-content.
            chatContent.append(
                `<div class="pf2e-threat-opportunity-detail ${detailClass}">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>${detailText}</span>
                </div>`
            );
            // Set a flag on the message to indicate it has been processed by this module.
            message.setFlag("pf2e-threat-opportunity", "processed", true);
            console.log(`PF2e Threat & Opportunity | Added '${detailText}' to message ${message.id}.`);
        }
    }
});