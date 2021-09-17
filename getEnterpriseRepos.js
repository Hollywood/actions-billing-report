 const { graphql } = require('@octokit/graphql');
 const graphqlWithAuth = graphql.defaults({
   headers: {
     authorization: `token ${process.env.GITHUB_TOKEN}`,
   },
 });

 module.exports = async function getEnterpriseRepos (enterpriseSlug) {
    const query = `
        query ($after: String){
            enterprise(slug: "${enterpriseSlug}") {
              organizations(first:100, after:$after) {
                  nodes{
                    login
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }`
  

    var orgs = [];

    /**
     * Recursively checks the GraphQL API's response for the list of Org Names.
     * @param {string} [after]
     */
    async function makeRequest (after) {
      const result = await graphqlWithAuth(query, {
        after
      })
  
      // Read the Organization nodes and pageInfo from the result
      const { nodes, pageInfo } = result.enterprise.organizations;

      // Add organization names to the orgs array
      nodes.forEach(node => {
        orgs.push(node.login);
      });

      // We have more pages to check
      if (pageInfo.hasNextPage) {
        return makeRequest(pageInfo.endCursor)
      }
      
      return orgs;

    }
  
    return makeRequest()
  }