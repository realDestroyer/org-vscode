const { getAcceptedDateFormats } = require("./orgTagUtils");
const { transformDayHeadingDate } = require("./incrementDate");
const { adjustDateStamps } = require("./dateStampAdjust");

function decrementDate() {
    return adjustDateStamps(false);
}

// ** Command to decrement the date backward **
function decrementDateBackward() {
    decrementDate();
}

module.exports = {
    decrementDateBackward
};
