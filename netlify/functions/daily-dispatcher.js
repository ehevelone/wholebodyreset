exports.handler = async function () {
  return {
    statusCode: 200,
    body: JSON.stringify({
      status: "ok",
      message: "daily dispatcher live"
    })
  };
};
