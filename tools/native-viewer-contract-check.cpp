#include <terraflux/scene_io.hpp>
#include <terraflux/assets/obj.hpp>
#include <terraflux/assets/cpu_recipe_budget.hpp>
#include <algorithm>
#include <fstream>
#include <iterator>
#include <iostream>
#include <filesystem>
#include <limits>
#include <cmath>
#include <stdexcept>
int main(int argc,char** argv){try{
 if(argc!=10)throw std::runtime_error("expected bundle, triangles, bounds and logical bytes");
 const std::filesystem::path root=argv[1];std::ifstream scene_input(root/"scene.json");const std::string text{std::istreambuf_iterator<char>(scene_input),std::istreambuf_iterator<char>()};
 const auto scene=terraflux::scene::deserialize_scene(text);if(scene.size()!=2||scene.mesh_assets().size()!=1||!scene.get(1).mesh_asset)throw std::runtime_error("scene adapter shape mismatch");
 std::ifstream obj_input(root/scene.mesh_assets().begin()->second);if(!obj_input)throw std::runtime_error("OBJ asset missing");const auto mesh=terraflux::assets::import_obj(obj_input);
 if(mesh.indices.size()/3!=std::stoull(argv[2]))throw std::runtime_error("triangle count mismatch");
 double lo[3]={INFINITY,INFINITY,INFINITY},hi[3]={-INFINITY,-INFINITY,-INFINITY};
 for(const auto& vertex:mesh.vertices){const double p[3]={vertex.position.x,vertex.position.y,vertex.position.z};for(int i=0;i<3;i++){lo[i]=std::min(lo[i],p[i]);hi[i]=std::max(hi[i],p[i]);}const auto& n=vertex.normal;if(std::abs(std::sqrt(n.x*n.x+n.y*n.y+n.z*n.z)-1)>1e-7)throw std::runtime_error("normal mismatch");}
 for(int i=0;i<3;i++)if(std::abs(lo[i]-std::stod(argv[3+i]))>1e-8||std::abs(hi[i]-std::stod(argv[6+i]))>1e-8)throw std::runtime_error("bounds mismatch");
 const auto bytes=terraflux::assets::mesh_recipe_bytes(mesh);if(bytes.total()!=std::stoull(argv[9])||sizeof(terraflux::assets::MeshVertex)!=96)throw std::runtime_error("native mesh recipe ABI/byte estimate mismatch");
 terraflux::assets::check_cpu_recipe_budget(bytes,bytes.total());bool rejected=false;try{terraflux::assets::check_cpu_recipe_budget(bytes,bytes.total()-1);}catch(const std::length_error&){rejected=true;}if(!rejected)throw std::runtime_error("native over-budget admission was not rejected");
 std::cout<<"Native logical CPU mesh bytes: "<<bytes.total()<<"; exact-fit accepted, one-byte-short rejected\n";
 std::cout<<"Native scene-v2 and OBJ parsers accepted "<<mesh.indices.size()/3<<" triangles; bounds and normals match\n";
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
