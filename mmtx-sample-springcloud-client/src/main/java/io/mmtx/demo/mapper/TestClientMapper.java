package io.mmtx.demo.mapper;

import org.apache.ibatis.annotations.Param;

public interface TestClientMapper {

	int inserTxClient(@Param("data")String data,@Param("status")String status);

}
