function doPost(e) {
  var spreadsheetId = "1eEWtn9Sw8zMCbq_BXVkFPr48I9rf25nAElAmHA5b03M";
  var userSheetGid = 1736727794; 
  var paymentSheetName = "CK"; 
  
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var params = JSON.parse(e.postData.contents);
  var action = params.action;

  function getSheetByGid(gid) {
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].getSheetId() == gid) {
        return sheets[i];
      }
    }
    return null;
  }

  // Tìm user trong sheet User (Cấu trúc: A=User, B=Pass, C=Email, D=Usage, E=Date)
  function findUserRow(sheet, username) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] == username) { // Cột A (index 0) là Username
        return { rowIndex: i + 1, data: data[i] };
      }
    }
    return null;
  }

  // --- ACTION: REGISTER ---
  if (action === "register") {
    var userSheet = getSheetByGid(userSheetGid);
    if (!userSheet) return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "User Sheet not found" })).setMimeType(ContentService.MimeType.JSON);

    var username = params.username;
    var email = params.email;
    var password = params.password;

    if (findUserRow(userSheet, username)) {
       return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "User already exists" })).setMimeType(ContentService.MimeType.JSON);
    }

    var timestamp = new Date();
    // Cấu trúc: A:User, B:Pass, C:Email, D:Usage, E:Date
    userSheet.appendRow([username, password, email, 0, timestamp]);
    
    return ContentService.createTextOutput(JSON.stringify({ result: "success", message: "User registered" })).setMimeType(ContentService.MimeType.JSON);
  } 
  
  // --- ACTION: SUBMIT PAYMENT (Sheet CK) ---
  else if (action === "submit_payment") {
    var paymentSheet = ss.getSheetByName(paymentSheetName);
    if (!paymentSheet) return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Sheet CK not found" })).setMimeType(ContentService.MimeType.JSON);

    var name = params.name;
    var email = params.email;
    var phone = params.phone;
    var orderCode = params.orderCode;
    var timestamp = new Date();

    // Cấu trúc CK: A:Time, B:Code, C:Name, D:Email, E:Phone, F:Status
    paymentSheet.appendRow([timestamp, orderCode, name, email, phone, "PENDING_PAYMENT"]);
    return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
  }

  // --- ACTION: CHECK PAYMENT STATUS ---
  else if (action === "check_payment_status") {
    var paymentSheet = ss.getSheetByName(paymentSheetName);
    if (!paymentSheet) return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Sheet CK not found" })).setMimeType(ContentService.MimeType.JSON);
    
    var orderCode = params.orderCode;
    var data = paymentSheet.getDataRange().getValues();
    var status = "PENDING_PAYMENT";
    
    // Cấu trúc CK: A:Time, B:Code, C:Name, D:Email, E:Phone, F:Status
    // Duyệt ngược từ dưới lên để lấy trạng thái mới nhất
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][1] == orderCode) { // Cột B (index 1) là Order Code
        status = data[i][5]; // Cột F (index 5) là Status
        break;
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ result: "success", status: status })).setMimeType(ContentService.MimeType.JSON);
  }

  // --- ACTION: LOGIN ---
  else if (action === "login") {
    var userSheet = getSheetByGid(userSheetGid);
    if (!userSheet) return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "User Sheet not found" })).setMimeType(ContentService.MimeType.JSON);

    var username = params.username;
    var password = params.password;
    
    var userRow = findUserRow(userSheet, username);
    if (userRow) {
      // Cấu trúc: B (index 1) là Password
      if (userRow.data[1] == password) {
         var usage = userRow.data[3] || 0; // Cột D (index 3) là Usage
         var apiKey = (userRow.data.length > 5) ? userRow.data[5] : ""; // Cột F (index 5) là API Key (nếu có)
         return ContentService.createTextOutput(JSON.stringify({ result: "success", usage: usage, apiKey: apiKey })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Invalid credentials" })).setMimeType(ContentService.MimeType.JSON);
  }

  // --- ACTION: INCREMENT USAGE ---
  else if (action === "increment_usage") {
    var userSheet = getSheetByGid(userSheetGid);
    var userRow = findUserRow(userSheet, params.username);
    if (userRow) {
      var currentUsage = userRow.data[3] || 0; // Cột D
      userSheet.getRange(userRow.rowIndex, 4).setValue(currentUsage + 1); // Cột 4 (D)
      return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "User not found" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // --- ACTION: GET USERS ---
  else if (action === "get_users") {
      var userSheet = getSheetByGid(userSheetGid);
      var users = [];
      if (userSheet) {
        var data = userSheet.getDataRange().getValues();
        for (var j = 1; j < data.length; j++) {
            // A:User, B:Pass, C:Email, D:Usage
            users.push({
                username: data[j][0],
                email: data[j][2],
                usage: data[j][3] || 0,
                apiKey: (data[j].length > 5) ? data[j][5] : ""
            });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ result: "success", users: users })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // --- ACTION: UPDATE USAGE ---
  else if (action === "update_user_usage") {
      var userSheet = getSheetByGid(userSheetGid);
      var userRow = findUserRow(userSheet, params.username);
      if (userRow) {
          userSheet.getRange(userRow.rowIndex, 4).setValue(params.usage); // Cột 4 (D)
          return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "User not found" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // --- ACTION: UPDATE KEY ---
  else if (action === "update_user_key") {
      var userSheet = getSheetByGid(userSheetGid);
      var userRow = findUserRow(userSheet, params.username);
      if (userRow) {
          userSheet.getRange(userRow.rowIndex, 6).setValue(params.apiKey); // Cột 6 (F)
          return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "User not found" })).setMimeType(ContentService.MimeType.JSON);
  }

  // --- BOT ACTIONS ---
  var botSheet = ss.getSheetByName("BOT ALL");
  if (action === "add" && botSheet) {
     botSheet.appendRow([params.name, params.systemInstruction, params.userInstructions, params.gemLink, params.imageUrl]);
     return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
  } else if (action === "delete" && botSheet) {
     var botName = params.name;
     var data = botSheet.getDataRange().getValues();
     for (var i = 1; i < data.length; i++) {
         if (data[i][0] == botName) {
             botSheet.deleteRow(i + 1);
             return ContentService.createTextOutput(JSON.stringify({ result: "success" })).setMimeType(ContentService.MimeType.JSON);
         }
     }
  }

  return ContentService.createTextOutput(JSON.stringify({ result: "error", message: "Invalid action" })).setMimeType(ContentService.MimeType.JSON);
}
